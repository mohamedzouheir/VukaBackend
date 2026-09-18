package za.gov.dsac.vuka.service;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Workflow data on top of the reference seed, so every screen in the product has something on it
 * to act on during a demonstration.
 *
 * <h2>Everything this class writes is ILLUSTRATIVE</h2>
 *
 * {@link SeedService} loads published figures and labels the few things it has to invent. This
 * class is the other way round: nothing it writes is sourced. The review decisions, the comments,
 * the tasks, the evidence files and the completed Q2 template are all made up to exercise the
 * workflow, and none of it should be quoted as something a named entity or a DSAC official did.
 * Every document it stores says so on its first line.
 *
 * <h2>What the demonstration looks like after it runs</h2>
 *
 * The date is the real date. The reporter's screens open on the quarter that is open, and the
 * Department's screens open on the quarter that has fallen due (see
 * {@link ReportingViewService#reviewPeriodId()}), so in September 2026:
 * <ul>
 *   <li><b>Q1 2026/27, fallen due.</b> Six entities approved, four submitted and awaiting review,
 *       the National Library returned with two open disputes, Robben Island Museum with nothing
 *       filed, and the demo reporter's entity submitted and waiting, so a reviewer can return it
 *       live and the reporter can answer.</li>
 *   <li><b>Q2 2026/27, open.</b> Two entities with a draft started. The demo reporter's entity has
 *       nothing yet, and a completed template is written to {@code vuka.demo.output-dir} for the
 *       reporter to upload. Every figure in it is present and clean except one deliberately empty
 *       row, so the confirmation screen opens with one button that writes the rest and one row to
 *       fill by hand and attach a supporting document to. It also carries an indicator code the
 *       entity never registered, which lands in "Held aside" without the reporter touching it.</li>
 * </ul>
 *
 * <h2>When it runs</h2>
 *
 * Once, after the reference seed, on a database that has the reference entities and no comments
 * and no tasks. That is what a database looks like before anybody has used it, so the class never
 * writes over anything a person did. It finds entities by short name rather than by id, because a
 * reporter account's entityId claim points at a row that already exists and a reseed would
 * orphan it.
 */
@Component
@Order(2)
public class DemoDataService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataService.class);

    private static final ZoneId ZONE = ZoneId.of("Africa/Johannesburg");
    private static final String CURRENT_YEAR = "2026/27";

    private static final String REVIEWER_NAME = "Thandi Mokoena, DSAC Reviewer (demo)";
    private static final String EXECUTIVE_NAME = "Director-General (demo)";
    private static final String ADMIN_NAME = "DSAC Administrator (demo)";
    private static final String REPORTER_NAME = "Nomsa, Reporting Officer (demo)";

    private final PublicEntityRepository entities;
    private final FinancialYearRepository years;
    private final ReportingPeriodRepository periods;
    private final SubmissionRepository submissions;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final DocumentRecordRepository documents;
    private final CommentRepository comments;
    private final TaskItemRepository tasks;
    private final EntityWorkspaceRepository workspaces;
    private final UserProfileRepository users;
    private final AllocationRepository allocations;
    private final DocumentVersionService documentVersions;
    private final TemplateWriter templateWriter;
    private final UnitCostService unitCost;

    @Value("${vuka.demo.enabled:false}") private boolean enabled;
    @Value("${vuka.demo.reporter-entity:Iziko}") private String reporterEntity;
    @Value("${vuka.demo.reporter-uid:dev-entity_reporter}") private String reporterUid;
    @Value("${vuka.demo.reviewer-uid:dev-dsac_reviewer}") private String reviewerUid;
    @Value("${vuka.demo.executive-uid:dev-dsac_executive}") private String executiveUid;
    @Value("${vuka.demo.admin-uid:dev-admin}") private String adminUid;
    @Value("${vuka.demo.output-dir:./var/demo}") private String outputDir;

    public DemoDataService(PublicEntityRepository entities, FinancialYearRepository years,
                           ReportingPeriodRepository periods, SubmissionRepository submissions,
                           TargetRepository targets, TargetResultRepository results,
                           DocumentRecordRepository documents, CommentRepository comments,
                           TaskItemRepository tasks, EntityWorkspaceRepository workspaces,
                           UserProfileRepository users, AllocationRepository allocations,
                           DocumentVersionService documentVersions, TemplateWriter templateWriter,
                           UnitCostService unitCost) {
        this.entities = entities;
        this.years = years;
        this.periods = periods;
        this.submissions = submissions;
        this.targets = targets;
        this.results = results;
        this.documents = documents;
        this.comments = comments;
        this.tasks = tasks;
        this.workspaces = workspaces;
        this.users = users;
        this.allocations = allocations;
        this.documentVersions = documentVersions;
        this.templateWriter = templateWriter;
        this.unitCost = unitCost;
    }

    /** Everything the steps below share. Built once, so no step looks an entity up twice. */
    private record Context(Map<String, PublicEntity> byShortName, FinancialYear year,
                           ReportingPeriod q1, ReportingPeriod q2,
                           Map<String, Submission> q1Submissions) {
        PublicEntity entity(String shortName) { return byShortName.get(shortName); }
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) { log.info("Demo data disabled"); return; }
        if (entities.count() == 0) { log.info("No reference seed, so no demo data"); return; }
        if (comments.count() > 0 || tasks.count() > 0) {
            log.info("Comments or tasks already exist, so demo data was not added");
            return;
        }

        Context ctx = context();
        if (ctx == null) return;

        seedUsers(ctx);
        seedWorkspaces(ctx);
        seedQ1Reviews(ctx);
        Map<String, DocumentRecord> docs = seedDocuments(ctx);
        seedComments(ctx, docs);
        seedTasks(ctx, docs);
        seedQ2Drafts(ctx);
        writeCompletedTemplate(ctx);

        log.info("Demo data added. Every review, comment, task and document in it is illustrative.");
    }

    private Context context() {
        Map<String, PublicEntity> byShortName = new LinkedHashMap<>();
        entities.findAll().forEach(e -> byShortName.put(e.getShortName(), e));
        if (!byShortName.containsKey(reporterEntity)) {
            log.warn("Demo reporter entity {} is not in the register; demo data not added", reporterEntity);
            return null;
        }
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null || !CURRENT_YEAR.equals(fy.getLabel())) {
            log.warn("Current financial year is not {}; demo data not added", CURRENT_YEAR);
            return null;
        }
        List<ReportingPeriod> quarters = periods.findByFinancialYearIdOrderByQuarterAsc(fy.getId());
        ReportingPeriod q1 = quarters.stream().filter(p -> Integer.valueOf(1).equals(p.getQuarter())).findFirst().orElse(null);
        ReportingPeriod q2 = quarters.stream().filter(p -> Integer.valueOf(2).equals(p.getQuarter())).findFirst().orElse(null);
        if (q1 == null || q2 == null) {
            log.warn("Q1 or Q2 {} missing; demo data not added", CURRENT_YEAR);
            return null;
        }
        Map<String, Submission> q1Subs = new LinkedHashMap<>();
        for (Submission s : submissions.findByReportingPeriodId(q1.getId())) {
            q1Subs.put(s.getEntity().getShortName(), s);
        }
        return new Context(byShortName, fy, q1, q2, q1Subs);
    }

    // ------------------------------------------------------------------
    // People and workspaces
    // ------------------------------------------------------------------

    /**
     * Profiles for the four demo accounts, so a task set through the API resolves a name and knows
     * which side of the departmental boundary its assignee sits on. No email is stored here; the
     * signed token carries it.
     */
    private void seedUsers(Context ctx) {
        profile(reporterUid, REPORTER_NAME, Enums.Role.ENTITY_REPORTER, ctx.entity(reporterEntity));
        profile(reviewerUid, REVIEWER_NAME, Enums.Role.DSAC_REVIEWER, null);
        profile(executiveUid, EXECUTIVE_NAME, Enums.Role.DSAC_EXECUTIVE, null);
        profile(adminUid, ADMIN_NAME, Enums.Role.ADMIN, null);
    }

    private void profile(String uid, String name, Enums.Role role, PublicEntity entity) {
        if (uid == null || uid.isBlank() || users.findByUid(uid).isPresent()) return;
        UserProfile u = new UserProfile();
        u.setUid(uid);
        u.setDisplayName(name);
        u.setRole(role);
        u.setEntity(entity);
        users.save(u);
    }

    /** One workspace per entity, none bound to Microsoft 365. Binding one is a live step, not a seed. */
    private void seedWorkspaces(Context ctx) {
        for (PublicEntity e : ctx.byShortName().values()) {
            if (workspaces.findByEntityId(e.getId()).isPresent()) continue;
            EntityWorkspace w = new EntityWorkspace();
            w.setEntity(e);
            w.setFolderPath("Vuka");
            w.setCreatedAt(at(2026, 4, 1, 8, 0));
            workspaces.save(w);
        }
    }

    // ------------------------------------------------------------------
    // Q1 2026/27: every review state
    // ------------------------------------------------------------------

    private void seedQ1Reviews(Context ctx) {
        // Approved a few days after they came in.
        for (String shortName : List.of("SAHRA", "SAIDS", "MarketTheatre", "Artscape", "NAC", "Playhouse")) {
            Submission s = ctx.q1Submissions().get(shortName);
            if (s == null || s.getSubmittedAt() == null) continue;
            s.setStatus(Enums.SubmissionStatus.APPROVED);
            s.setReviewedByUid(reviewerUid);
            s.setReviewedAt(s.getSubmittedAt().plusSeconds(4L * 86_400 + 10L * 3_600));
            s.setReturnReason(null);
            submissions.save(s);
        }

        // In and waiting for a reviewer.
        for (String shortName : List.of("PACOFS", "FreedomPark", "PanSALB", "BoxingSA", reporterEntity)) {
            Submission s = ctx.q1Submissions().get(shortName);
            if (s == null) continue;
            s.setStatus(Enums.SubmissionStatus.SUBMITTED);
            s.setReviewedByUid(null);
            s.setReviewedAt(null);
            s.setReturnReason(null);
            submissions.save(s);
        }

        // Returned. The two disputes that reopen its figures are written in seedComments.
        Submission nlsa = ctx.q1Submissions().get("NLSA");
        if (nlsa != null) {
            nlsa.setStatus(Enums.SubmissionStatus.RETURNED);
            nlsa.setReviewedByUid(reviewerUid);
            nlsa.setReviewedAt(at(2026, 8, 18, 11, 30));
            nlsa.setReturnReason("Two figures are disputed, LIB-1.1 and LIB-1.3. Correct or explain them, "
                    + "and give a reason for each indicator with no figure, then resubmit.");
            submissions.save(nlsa);
        }

        completeReporterQ1(ctx);
    }

    /**
     * Answers every registered target on the demo reporter's Q1 submission.
     *
     * <p>The reference seed reports only part of this entity's indicators, which is the evidence gap
     * signal doing its job. For the demo it is the submission a reviewer returns live, and a returned
     * period reopens every unanswered target as well as the disputed ones, so the reporter would face
     * a dozen rows instead of the one or two the reviewer questioned. Answering the rest keeps the
     * round trip to what a presenter can show in a minute. It also lowers this one entity's evidence
     * gap signal, which is the cost of choosing it.
     */
    private void completeReporterQ1(Context ctx) {
        PublicEntity e = ctx.entity(reporterEntity);
        Submission s = ctx.q1Submissions().get(reporterEntity);
        if (s == null || s.getSubmittedAt() == null) return;

        Set<UUID> answered = new HashSet<>();
        results.findBySubmissionId(s.getId()).forEach(r -> answered.add(r.getTarget().getId()));

        List<Target> registered = sortedTargets(e, ctx.year());
        BigDecimal perTarget = perTargetAllocation(e, ctx.year(), registered.size());

        for (Target t : registered) {
            if (answered.contains(t.getId())) continue;
            BigDecimal quarterTarget = t.getQ1Target();
            BigDecimal actual = quarterTarget.multiply(new BigDecimal("0.75")).setScale(0, RoundingMode.HALF_UP);
            BigDecimal spend = perTarget == null ? null
                    : perTarget.multiply(new BigDecimal("0.22")).setScale(2, RoundingMode.HALF_UP);

            TargetResult r = new TargetResult();
            r.setTarget(t);
            r.setSubmission(s);
            r.setIndicatorRef(t.getIndicatorRef());
            r.setActualValue(actual);
            r.setQuarterTarget(quarterTarget);
            r.setVariance(actual.subtract(quarterTarget));
            r.setVarianceExplanation(actual.compareTo(quarterTarget) < 0
                    ? "Two planned events moved into July by the venue. (Illustrative explanation.)"
                    : null);
            r.setSpendToDate(spend);
            r.setActualUnitCost(unitCost.actualUnitCost(spend, actual));
            r.setStatus(actual.compareTo(quarterTarget) >= 0
                    ? Enums.TargetStatus.ACHIEVED : Enums.TargetStatus.IN_PROGRESS);
            r.setConfirmedByUid(s.getSubmittedByUid());
            r.setConfirmedByName(s.getSubmittedByName());
            r.setConfirmedAt(s.getSubmittedAt());
            results.save(r);
        }
    }

    // ------------------------------------------------------------------
    // Documents: evidence against Q1 figures, and the workspace library
    // ------------------------------------------------------------------

    /** One piece of evidence: which indicator, which of the Auditor-General's tests, and its fate. */
    private record Evidence(String ref, Enums.AgsaCriterion criterion, Enums.ApprovalStatus decision,
                            String note) {}

    private Map<String, DocumentRecord> seedDocuments(Context ctx) {
        Map<String, DocumentRecord> named = new LinkedHashMap<>();

        evidence(ctx, "SAHRA", List.of(
                new Evidence("HER-1.1", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("HER-1.2", Enums.AgsaCriterion.ACCURACY, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("HER-1.3", Enums.AgsaCriterion.VALIDITY, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("HER-1.4", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("HER-1.5", Enums.AgsaCriterion.ACCURACY, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("HER-2.1", Enums.AgsaCriterion.VALIDITY, Enums.ApprovalStatus.APPROVED, null)));
        evidence(ctx, "MarketTheatre", List.of(
                new Evidence("ART-1.1", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("ART-1.2", Enums.AgsaCriterion.VALIDITY, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("ART-1.3", Enums.AgsaCriterion.ACCURACY, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("ART-2.1", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.APPROVED, null)));
        evidence(ctx, reporterEntity, List.of(
                new Evidence("HER-1.1", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.PENDING, null),
                new Evidence("HER-1.1", Enums.AgsaCriterion.ACCURACY, Enums.ApprovalStatus.PENDING, null),
                new Evidence("HER-1.2", Enums.AgsaCriterion.VALIDITY, Enums.ApprovalStatus.PENDING, null),
                new Evidence("HER-1.4", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.PENDING, null),
                new Evidence("HER-2.1", Enums.AgsaCriterion.ACCURACY, Enums.ApprovalStatus.PENDING, null),
                new Evidence("HER-2.3", Enums.AgsaCriterion.VALIDITY, Enums.ApprovalStatus.PENDING, null)));
        evidence(ctx, "NLSA", List.of(
                new Evidence("LIB-1.1", Enums.AgsaCriterion.VALIDITY, Enums.ApprovalStatus.REJECTED,
                        "The attendance register is unsigned, so it cannot show the event took place."),
                new Evidence("LIB-1.2", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.APPROVED, null),
                new Evidence("LIB-2.1", Enums.AgsaCriterion.ACCURACY, Enums.ApprovalStatus.PENDING, null)));
        evidence(ctx, "BoxingSA", List.of(
                new Evidence("SPT-1.1", Enums.AgsaCriterion.COMPLETENESS, Enums.ApprovalStatus.PENDING, null)));

        // The reporter's workspace library, including one document with a three version history:
        // rejected, then approved, then a revision nobody has looked at yet.
        PublicEntity rep = ctx.entity(reporterEntity);
        named.put("reporterApp", library(rep, Enums.DocumentType.ANNUAL_PERFORMANCE_PLAN,
                "Annual Performance Plan 2026-27.pdf", "Annual Performance Plan 2026/27",
                at(2026, 4, 2, 9, 15), Enums.ApprovalStatus.APPROVED, at(2026, 4, 8, 14, 0), null));
        named.put("reporterQ1Report", library(rep, Enums.DocumentType.QUARTERLY_REPORT,
                "Q1 2026-27 quarterly report (signed).pdf", "Q1 2026/27 quarterly report, signed by the accounting authority",
                at(2026, 8, 9, 16, 40), Enums.ApprovalStatus.PENDING, null, null));

        String plan = "Audit action plan 2025-26.pdf";
        String planTitle = "Audit action plan responding to the 2024/25 audit";
        library(rep, Enums.DocumentType.OPERATIONAL_PLAN, plan, planTitle + " (first draft)",
                at(2026, 6, 15, 10, 0), Enums.ApprovalStatus.REJECTED, at(2026, 6, 19, 9, 30),
                "Does not address the finding on the heritage assets register. Please add it with an owner and a date.");
        library(rep, Enums.DocumentType.OPERATIONAL_PLAN, plan, planTitle + " (second draft)",
                at(2026, 7, 20, 11, 20), Enums.ApprovalStatus.APPROVED, at(2026, 7, 24, 15, 5), null);
        named.put("reporterPlan", library(rep, Enums.DocumentType.OPERATIONAL_PLAN, plan,
                planTitle + " (third draft, revised timeline)",
                at(2026, 9, 12, 8, 45), Enums.ApprovalStatus.PENDING, null, null));

        PublicEntity sahra = ctx.entity("SAHRA");
        named.put("sahraApp", library(sahra, Enums.DocumentType.ANNUAL_PERFORMANCE_PLAN,
                "Annual Performance Plan 2026-27.pdf", "Annual Performance Plan 2026/27",
                at(2026, 4, 1, 12, 0), Enums.ApprovalStatus.APPROVED, at(2026, 4, 6, 10, 0), null));
        library(ctx.entity("MarketTheatre"), Enums.DocumentType.ANNUAL_PERFORMANCE_PLAN,
                "Annual Performance Plan 2026-27.pdf", "Annual Performance Plan 2026/27",
                at(2026, 4, 3, 9, 0), Enums.ApprovalStatus.APPROVED, at(2026, 4, 9, 11, 0), null);
        library(ctx.entity("NLSA"), Enums.DocumentType.QUARTERLY_REPORT,
                "Q1 2026-27 quarterly report.pdf", "Q1 2026/27 quarterly report",
                at(2026, 8, 11, 17, 5), Enums.ApprovalStatus.REJECTED, at(2026, 8, 18, 11, 25),
                "Not signed by the accounting authority. Upload the signed copy with the resubmission.");
        library(ctx.entity("BoxingSA"), Enums.DocumentType.FINANCIALS,
                "Management accounts June 2026.pdf", "Management accounts to 30 June 2026",
                at(2026, 8, 24, 9, 30), Enums.ApprovalStatus.PENDING, null, null);
        return named;
    }

    private void evidence(Context ctx, String shortName, List<Evidence> items) {
        PublicEntity e = ctx.entity(shortName);
        Submission s = ctx.q1Submissions().get(shortName);
        if (e == null || s == null || s.getSubmittedAt() == null) return;

        Instant uploaded = s.getSubmittedAt().minusSeconds(3L * 3_600);
        Instant decided = s.getReviewedAt() != null ? s.getReviewedAt() : s.getSubmittedAt().plusSeconds(5L * 86_400);

        for (Evidence item : items) {
            Target t = targets.findByEntityIdAndFinancialYearIdAndIndicatorRef(e.getId(), ctx.year().getId(), item.ref())
                    .orElse(null);
            if (t == null) continue;
            String fileName = item.ref() + " " + evidenceKind(item.criterion()) + " Q1 2026-27.pdf";
            byte[] pdf = placeholderPdf(e.getName(), item.ref() + " " + t.getIndicator(),
                    evidenceKind(item.criterion()) + ", offered for the " + item.criterion().name().toLowerCase()
                    + " test");
            DocumentRecord d = documentVersions.store(DocumentVersionService.Incoming.evidence(
                    e.getId(), t.getId(), fileName, "application/pdf", pdf, null, s.getId(),
                    item.criterion())).record();
            d.setUploadedByUid(s.getSubmittedByUid());
            backdate(d, uploaded);
            decide(d, item.decision(), item.decision() == Enums.ApprovalStatus.PENDING ? null : decided, item.note());
            documents.save(d);
        }
    }

    private static String evidenceKind(Enums.AgsaCriterion criterion) {
        return switch (criterion) {
            case COMPLETENESS -> "register extract";
            case ACCURACY -> "reconciliation to source";
            case VALIDITY -> "signed attendance register";
            default -> "supporting document";
        };
    }

    /**
     * One version of a library document. A second call with the same file name becomes the next
     * version, through the same write path an upload takes, and the version it replaces is stamped
     * superseded at the moment the new one arrived.
     */
    private DocumentRecord library(PublicEntity e, Enums.DocumentType type, String fileName, String title,
                                   Instant uploaded, Enums.ApprovalStatus decision, Instant decidedAt,
                                   String note) {
        if (e == null) return null;
        String who = e.getShortName().equals(reporterEntity) ? reporterUid : "seed-reporter-" + e.getShortName().toLowerCase();
        byte[] pdf = placeholderPdf(e.getName(), title, "Workspace document");
        DocumentVersionService.Stored stored = documentVersions.store(new DocumentVersionService.Incoming(
                e.getId(), type, fileName, "application/pdf", pdf, Enums.DocumentSource.VUKA_UPLOAD,
                who, null, null, null, null, null));
        DocumentRecord d = stored.record();
        backdate(d, uploaded);
        decide(d, decision, decidedAt, note);
        documents.save(d);
        if (d.getSupersedes() != null) {
            DocumentRecord previous = d.getSupersedes();
            previous.setSupersededOn(uploaded);
            documents.save(previous);
        }
        return d;
    }

    /**
     * Moves a stored version to the time it would have arrived, receipt number included. The
     * receipt number embeds its day, and a receipt dated today on a file received in August is
     * exactly the kind of inconsistency somebody in the room notices.
     */
    private static void backdate(DocumentRecord d, Instant when) {
        d.setUploadedAt(when);
        d.setReceivedAt(when);
        if (d.getReceiptNumber() != null) {
            String day = java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZONE).format(when);
            d.setReceiptNumber(d.getReceiptNumber().replaceFirst("^VK-\\d{8}-", "VK-" + day + "-"));
        }
    }

    private void decide(DocumentRecord d, Enums.ApprovalStatus decision, Instant when, String note) {
        d.setApprovalStatus(decision);
        if (decision == Enums.ApprovalStatus.PENDING || when == null) return;
        d.setDecidedByUid(reviewerUid);
        d.setDecidedByName(REVIEWER_NAME);
        d.setDecidedAt(when);
        d.setDecisionNote(note);
    }

    // ------------------------------------------------------------------
    // Comments
    // ------------------------------------------------------------------

    /**
     * Threads on figures and documents.
     *
     * <p>Only the two on the National Library's targets are disputes in the sense the system acts
     * on: a root comment on a TARGET, by the Department, unresolved. Those are what reopen exactly
     * those figures on its returned submission. Everything else is anchored to a reported result or
     * a document, where a question is a question and reopens nothing.
     */
    private void seedComments(Context ctx, Map<String, DocumentRecord> docs) {
        PublicEntity nlsa = ctx.entity("NLSA");
        Target lib11 = target(nlsa, ctx, "LIB-1.1");
        Target lib13 = target(nlsa, ctx, "LIB-1.3");
        if (lib11 != null) {
            Comment root = comment(nlsa, Enums.AnchorType.TARGET, lib11.getId(), null,
                    reviewerUid, REVIEWER_NAME, Enums.Role.DSAC_REVIEWER,
                    "The only evidence for this figure is an unsigned attendance register, so it cannot be traced to "
                    + "source. Please attach a signed register or correct the figure.",
                    at(2026, 8, 18, 11, 20));
            comment(nlsa, Enums.AnchorType.TARGET, lib11.getId(), root.getId(),
                    "seed-reporter-nlsa", "Reporting Officer (placeholder)", Enums.Role.ENTITY_REPORTER,
                    "The signed register is with the branch in Cape Town. We will upload it with the resubmission.",
                    at(2026, 8, 20, 9, 5));
        }
        if (lib13 != null) {
            comment(nlsa, Enums.AnchorType.TARGET, lib13.getId(), null,
                    reviewerUid, REVIEWER_NAME, Enums.Role.DSAC_REVIEWER,
                    "This is more than 20 percent under target and the explanation does not say which quarter "
                    + "the delivery moves to.",
                    at(2026, 8, 18, 11, 24));
        }

        PublicEntity rep = ctx.entity(reporterEntity);
        DocumentRecord plan = docs.get("reporterPlan");
        if (plan != null) {
            Comment root = comment(rep, Enums.AnchorType.DOCUMENT, plan.getId(), null,
                    reviewerUid, REVIEWER_NAME, Enums.Role.DSAC_REVIEWER,
                    "Section 3 now names an owner for the heritage assets register work but still gives no "
                    + "completion date. Can you add one before we approve this version?",
                    at(2026, 9, 14, 10, 10));
            comment(rep, Enums.AnchorType.DOCUMENT, plan.getId(), root.getId(),
                    reporterUid, REPORTER_NAME, Enums.Role.ENTITY_REPORTER,
                    "The revised timeline is in section 3.2, with 28 February 2027 as the completion date. "
                    + "I will make it clearer in section 3 as well.",
                    at(2026, 9, 15, 8, 30));
        }

        TargetResult shortfall = firstShortfall(ctx.q1Submissions().get(reporterEntity));
        if (shortfall != null) {
            Comment q = comment(rep, Enums.AnchorType.RESULT, shortfall.getId(), null,
                    reviewerUid, REVIEWER_NAME, Enums.Role.DSAC_REVIEWER,
                    "Which quarter does the deferred delivery on this indicator move to?",
                    at(2026, 8, 12, 14, 0));
            Comment a = comment(rep, Enums.AnchorType.RESULT, shortfall.getId(), q.getId(),
                    reporterUid, REPORTER_NAME, Enums.Role.ENTITY_REPORTER,
                    "Q2. The venue moved both events into July, and they are in the Q2 plan.",
                    at(2026, 8, 12, 16, 45));
            resolve(q, reviewerUid, REVIEWER_NAME, at(2026, 8, 13, 9, 0));
            comments.save(a);
        }

        TargetResult boxing = firstShortfall(ctx.q1Submissions().get("BoxingSA"));
        if (boxing != null) {
            comment(ctx.entity("BoxingSA"), Enums.AnchorType.RESULT, boxing.getId(), null,
                    reviewerUid, REVIEWER_NAME, Enums.Role.DSAC_REVIEWER,
                    "Seven of eighteen indicators have a figure. Is the rest still coming, or is there no "
                    + "delivery to report on them this quarter?",
                    at(2026, 8, 27, 15, 20));
        }

        DocumentRecord sahraApp = docs.get("sahraApp");
        if (sahraApp != null) {
            Comment q = comment(ctx.entity("SAHRA"), Enums.AnchorType.DOCUMENT, sahraApp.getId(), null,
                    reviewerUid, REVIEWER_NAME, Enums.Role.DSAC_REVIEWER,
                    "Is this the version as tabled, or the draft submitted in January?",
                    at(2026, 4, 3, 10, 0));
            comment(ctx.entity("SAHRA"), Enums.AnchorType.DOCUMENT, sahraApp.getId(), q.getId(),
                    "seed-reporter-sahra", "Reporting Officer (placeholder)", Enums.Role.ENTITY_REPORTER,
                    "As tabled. The tabling letter is on page 2.",
                    at(2026, 4, 3, 13, 40));
            resolve(q, reviewerUid, REVIEWER_NAME, at(2026, 4, 6, 9, 55));
        }
    }

    private Comment comment(PublicEntity e, Enums.AnchorType type, UUID anchorId, UUID parentId,
                            String uid, String name, Enums.Role role, String body, Instant when) {
        Comment c = new Comment();
        c.setEntity(e);
        c.setAnchorType(type);
        c.setAnchorId(anchorId);
        c.setParentId(parentId);
        c.setAuthorUid(uid);
        c.setAuthorName(name);
        c.setAuthorRole(role);
        c.setBody(body);
        c.setResolved(false);
        c.setCreatedAt(when);
        c.setUpdatedAt(when);
        return comments.save(c);
    }

    private void resolve(Comment c, String uid, String name, Instant when) {
        c.setResolved(true);
        c.setResolvedByUid(uid);
        c.setResolvedByName(name);
        c.setResolvedAt(when);
        c.setUpdatedAt(when);
        comments.save(c);
    }

    private TargetResult firstShortfall(Submission s) {
        if (s == null) return null;
        return results.findBySubmissionId(s.getId()).stream()
                .filter(r -> r.getVariance() != null && r.getVariance().signum() < 0)
                .min(Comparator.comparing(TargetResult::getIndicatorRef))
                .orElse(null);
    }

    // ------------------------------------------------------------------
    // Tasks
    // ------------------------------------------------------------------

    /**
     * Work for each of the four demo accounts, so every role's task list and rail badge has
     * something on it, set in both directions across the departmental boundary. External means
     * the task crosses between DSAC and an entity, which is how {@link WorkspaceService} derives it.
     */
    private void seedTasks(Context ctx, Map<String, DocumentRecord> docs) {
        PublicEntity rep = ctx.entity(reporterEntity);
        Submission repQ1 = ctx.q1Submissions().get(reporterEntity);
        PublicEntity robben = ctx.entity("RobbenIsland");

        // DSAC to the demo reporter.
        task(rep, "Attach evidence for the Q1 indicators with none",
                "Fifteen of the twenty Q1 figures have no evidence attached. A figure with none fails the "
                + "Auditor-General's completeness test.",
                reporterUid, REPORTER_NAME, reviewerUid, REVIEWER_NAME, LocalDate.of(2026, 9, 25),
                Enums.TaskStatus.OPEN, true, repQ1, null, at(2026, 8, 12, 14, 5), null);
        task(rep, "Add a completion date to the audit action plan",
                "See the comment on the third draft. Approval waits on the date.",
                reporterUid, REPORTER_NAME, reviewerUid, REVIEWER_NAME, LocalDate.of(2026, 9, 24),
                Enums.TaskStatus.OPEN, true, null, docs.get("reporterPlan"), at(2026, 9, 14, 10, 12), null);
        task(rep, "Prepare the Q2 2026/27 quarterly report",
                "Due 30 October 2026. Download the template from the reporting page.",
                reporterUid, REPORTER_NAME, reviewerUid, REVIEWER_NAME, LocalDate.of(2026, 10, 30),
                Enums.TaskStatus.OPEN, true, null, null, at(2026, 9, 1, 8, 0), null);
        task(rep, "Upload the signed Q1 quarterly report",
                null, reporterUid, REPORTER_NAME, reviewerUid, REVIEWER_NAME, LocalDate.of(2026, 8, 14),
                Enums.TaskStatus.DONE, true, repQ1, docs.get("reporterQ1Report"), at(2026, 8, 1, 9, 0),
                at(2026, 8, 9, 16, 41));

        // The demo reporter to DSAC.
        task(rep, "Advise whether HER-3.4 may be reported cumulatively",
                "The indicator counts learners reached. Our APP technical indicator description is silent on "
                + "whether a learner reached in Q1 and again in Q2 counts twice.",
                reviewerUid, REVIEWER_NAME, reporterUid, REPORTER_NAME, LocalDate.of(2026, 9, 26),
                Enums.TaskStatus.OPEN, true, null, null, at(2026, 9, 10, 11, 0), null);

        // Inside DSAC.
        task(rep, "Review the " + rep.getShortName() + " Q1 submission",
                "Submitted eleven days after the due date. Six pieces of evidence are waiting for a decision.",
                reviewerUid, REVIEWER_NAME, adminUid, ADMIN_NAME, LocalDate.of(2026, 9, 19),
                Enums.TaskStatus.OPEN, false, repQ1, null, at(2026, 9, 7, 8, 30), null);
        task(ctx.entity("BoxingSA"), "Review the Boxing SA Q1 submission",
                "Seven of eighteen indicators reported, twenty five days late.",
                reviewerUid, REVIEWER_NAME, adminUid, ADMIN_NAME, LocalDate.of(2026, 9, 22),
                Enums.TaskStatus.IN_PROGRESS, false, ctx.q1Submissions().get("BoxingSA"), null,
                at(2026, 9, 7, 8, 32), null);
        if (robben != null) {
            task(robben, "Chase Robben Island Museum for its Q1 report",
                    "Nothing filed for Q1, which fell due on 30 July. Its 2024/25 audit is outstanding.",
                    reviewerUid, REVIEWER_NAME, adminUid, ADMIN_NAME, LocalDate.of(2026, 9, 21),
                    Enums.TaskStatus.OPEN, false, null, null, at(2026, 9, 7, 8, 35), null);
            task(robben, "Brief the Portfolio Committee on Robben Island Museum",
                    "Q1 report not received and the 2024/25 audit outstanding. The risk panel lists the signals.",
                    executiveUid, EXECUTIVE_NAME, reviewerUid, REVIEWER_NAME, LocalDate.of(2026, 10, 7),
                    Enums.TaskStatus.OPEN, false, null, null, at(2026, 9, 15, 16, 0), null);
        }
        task(ctx.entity("SAHRA"), "Decide publication for the entities approved in Q1",
                "Six Q1 submissions are approved. Publication on the citizen view is a departmental decision, "
                + "made per entity on the entity register.",
                adminUid, ADMIN_NAME, reviewerUid, REVIEWER_NAME, LocalDate.of(2026, 9, 30),
                Enums.TaskStatus.OPEN, false, null, null, at(2026, 9, 16, 9, 0), null);

        // DSAC to another entity, overdue.
        task(ctx.entity("NLSA"), "Correct the two disputed Q1 figures and resubmit",
                "LIB-1.1 and LIB-1.3. See the comments on each.",
                "seed-reporter-nlsa", "Reporting Officer (placeholder)", reviewerUid, REVIEWER_NAME,
                LocalDate.of(2026, 9, 1), Enums.TaskStatus.OPEN, true, ctx.q1Submissions().get("NLSA"), null,
                at(2026, 8, 18, 11, 35), null);
    }

    private void task(PublicEntity e, String title, String description, String toUid, String toName,
                      String byUid, String byName, LocalDate due, Enums.TaskStatus status, boolean external,
                      Submission submission, DocumentRecord document, Instant created, Instant completed) {
        if (e == null) return;
        TaskItem t = new TaskItem();
        t.setEntity(e);
        t.setTitle(title);
        t.setDescription(description);
        t.setAssignedToUid(toUid);
        t.setAssignedToName(toName);
        t.setAssignedByUid(byUid);
        t.setCreatedByName(byName);
        t.setDueDate(due);
        t.setStatus(status);
        t.setExternal(external);
        t.setSubmission(submission);
        t.setDocument(document);
        t.setCreatedAt(created);
        t.setCompletedAt(status == Enums.TaskStatus.DONE ? completed : null);
        tasks.save(t);
    }

    // ------------------------------------------------------------------
    // Q2 2026/27: the open quarter
    // ------------------------------------------------------------------

    /** Drafts started early. Nothing confirmed: the quarter has not ended. */
    private void seedQ2Drafts(Context ctx) {
        draft(ctx, "SAHRA", Enums.SubmissionChannel.WEB, at(2026, 9, 1, 9, 0));
        draft(ctx, "MarketTheatre", Enums.SubmissionChannel.MOBILE, at(2026, 9, 8, 13, 15));
    }

    private void draft(Context ctx, String shortName, Enums.SubmissionChannel channel, Instant created) {
        PublicEntity e = ctx.entity(shortName);
        if (e == null || submissions.findByEntityIdAndReportingPeriodId(e.getId(), ctx.q2().getId()).isPresent()) return;
        Submission s = new Submission();
        s.setEntity(e);
        s.setReportingPeriod(ctx.q2());
        s.setStatus(Enums.SubmissionStatus.DRAFT);
        s.setChannel(channel);
        s.setCreatedAt(created);
        s.setSubmittedByUid("seed-reporter-" + shortName.toLowerCase());
        s.setSubmittedByName("Reporting Officer (placeholder)");
        submissions.save(s);
    }

    /**
     * Writes the demo reporter's Q2 template, completed, for uploading live.
     *
     * <p>Built by {@link TemplateWriter}, the same code behind the Download template button, so it
     * matches on the same indicator codes.
     *
     * <h3>One gap, on purpose</h3>
     *
     * <p>Every row but one arrives complete, numeric and inside the variance threshold, so the
     * confirmation screen opens with a single button that writes all of them. Exactly one row
     * ({@link #BLANK_ROW}) carries no figure and no evidence reference. That is the row the
     * demonstration is actually about: the reporter types the figure, sees the provenance line say
     * it was entered by hand rather than parsed, and attaches the supporting document against it.
     *
     * <p>This used to leave five rows needing attention, one for each thing the screen catches: a
     * figure typed as words, a figure typed as text, a shortfall with no reason, a missing figure
     * with its reason, and an unregistered indicator code. Each of those is a real case and each
     * is still handled by the code that reads the file; what they were not is a demonstration.
     * Four minutes of somebody retyping numbers in front of a panel buried the one claim the
     * screen exists to make. The unregistered code stays, because it costs the reporter nothing:
     * it lands in "Held aside" on its own.
     */
    private void writeCompletedTemplate(Context ctx) {
        PublicEntity e = ctx.entity(reporterEntity);
        List<Target> registered = sortedTargets(e, ctx.year());
        if (registered.isEmpty()) return;
        BigDecimal perTarget = perTargetAllocation(e, ctx.year(), registered.size());

        try {
            byte[] blank = templateWriter.build(e, ctx.q2(), registered);
            byte[] filled;
            try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(blank));
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                Sheet sheet = wb.getSheet(TemplateParser.SHEET_NAME);
                int r = TemplateParser.FIRST_DATA_ROW;
                for (int i = 0; i < registered.size(); i++, r++) {
                    Target t = registered.get(i);
                    Row row = sheet.getRow(r);
                    BigDecimal target = t.getQ2Target();
                    BigDecimal spend = perTarget == null ? null
                            : perTarget.multiply(new BigDecimal("0.48")).setScale(0, RoundingMode.HALF_UP);
                    fillRow(row, i, target, spend, t.getIndicatorRef());
                }
                // An indicator the entity never registered. Shown for manual matching, never dropped.
                Row extra = sheet.createRow(r);
                extra.createCell(0).setCellValue("HER-9.1");
                extra.createCell(1).setCellValue("Number of school holiday programmes delivered");
                extra.createCell(5).setCellValue(4);
                extra.createCell(9).setCellValue(38000);
                extra.createCell(10).setCellValue("Q2/HER-9.1/programme-list.pdf");
                wb.write(out);
                filled = out.toByteArray();
            }
            Path dir = Path.of(outputDir).toAbsolutePath().normalize();
            Files.createDirectories(dir);
            Path file = dir.resolve(templateWriter.fileName(e, ctx.q2()).replace("_template", "_completed"));
            Files.write(file, filled);
            log.info("Completed Q2 template for the demo reporter written to {}", file);
        } catch (Exception ex) {
            // The rest of the demo data stands without it; the reporter can still fill in the blank
            // template from the Download template button.
            log.warn("Could not write the completed Q2 template: {}", ex.getMessage());
        }
    }

    /**
     * The one row of the completed template left empty, counted from the first data row.
     *
     * <p>Third rather than first, so the reporter scrolls past two complete rows before reaching
     * it and can see what a filled row looks like, and early enough that it is on the first screen
     * without scrolling.
     */
    private static final int BLANK_ROW = 2;

    /**
     * One row of the completed template. Columns: 5 actual, 6 variance, 7 status, 8 explanation,
     * 9 spend, 10 evidence reference.
     *
     * <p>Every row is a clean number just above or on its quarter target, except {@link #BLANK_ROW},
     * which carries nothing at all. Nothing here is short enough of target to trip the variance
     * threshold, so the confirmation screen can write the lot in one click and the reporter's
     * whole task is the one row that is missing.
     */
    private static void fillRow(Row row, int i, BigDecimal target, BigDecimal spend, String ref) {
        // A target with no quarter value has nothing to fill a figure against, so it is left
        // empty for the same reason the blank row is.
        if (i == BLANK_ROW || target == null) {
            // No figure, no explanation and no evidence reference. The reporter types the figure
            // and attaches the supporting document against this target, live.
            return;
        }
        double q = target.doubleValue();
        long actual = Math.round(q * (i % 4 == 0 ? 1.1 : 1.0));
        row.getCell(5).setCellValue(actual);
        row.getCell(6).setCellValue(actual - Math.round(q));
        if (spend != null) row.getCell(9).setCellValue(spend.doubleValue());
        row.getCell(10).setCellValue("Q2/" + ref + "/register.pdf");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private List<Target> sortedTargets(PublicEntity e, FinancialYear fy) {
        if (e == null) return List.of();
        List<Target> list = new ArrayList<>(targets.findByEntityIdAndFinancialYearId(e.getId(), fy.getId()));
        list.sort(Comparator.comparing(Target::getIndicatorRef));
        return list;
    }

    private Target target(PublicEntity e, Context ctx, String ref) {
        if (e == null) return null;
        return targets.findByEntityIdAndFinancialYearIdAndIndicatorRef(e.getId(), ctx.year().getId(), ref).orElse(null);
    }

    private BigDecimal perTargetAllocation(PublicEntity e, FinancialYear fy, int count) {
        if (count == 0) return null;
        BigDecimal total = allocations.findByEntityIdAndFinancialYearId(e.getId(), fy.getId()).stream()
                .map(Allocation::getAmount).filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return total.signum() == 0 ? null : total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
    }

    private static Instant at(int y, int m, int d, int h, int min) {
        return LocalDateTime.of(y, m, d, h, min).atZone(ZONE).toInstant();
    }

    /**
     * A one page PDF that says what it is standing in for and that it is not that document. Hand
     * written because it is five objects and a content stream, and a PDF library for that would be
     * a dependency carried for the demo alone.
     */
    static byte[] placeholderPdf(String entityName, String title, String kind) {
        List<String> lines = new ArrayList<>();
        lines.add("VUKA DEMONSTRATION FILE. NOT A REAL DOCUMENT.");
        lines.add("");
        lines.addAll(wrap("Stands in for: " + title, 90));
        lines.addAll(wrap("Entity: " + entityName, 90));
        lines.addAll(wrap("Kind: " + kind, 90));
        lines.add("");
        lines.addAll(wrap("This file exists so that the receipt, the version history, the approval and the "
                + "comment thread on it can be demonstrated. Nothing in it is sourced, it was not produced by "
                + "the entity named above, and it should not be quoted.", 90));

        StringBuilder text = new StringBuilder("BT /F1 11 Tf 56 780 Td 14 TL");
        for (String line : lines) text.append(" (").append(pdfEscape(line)).append(") '");
        text.append(" ET");
        byte[] stream = text.toString().getBytes(StandardCharsets.ISO_8859_1);

        String[] objects = {
                "<< /Type /Catalog /Pages 2 0 R >>",
                "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
                "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
                null,
        };
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<Integer> offsets = new ArrayList<>();
        try {
            out.write("%PDF-1.4\n".getBytes(StandardCharsets.ISO_8859_1));
            for (int i = 0; i < objects.length; i++) {
                offsets.add(out.size());
                out.write(((i + 1) + " 0 obj\n").getBytes(StandardCharsets.ISO_8859_1));
                if (objects[i] != null) {
                    out.write(objects[i].getBytes(StandardCharsets.ISO_8859_1));
                } else {
                    out.write(("<< /Length " + stream.length + " >>\nstream\n").getBytes(StandardCharsets.ISO_8859_1));
                    out.write(stream);
                    out.write("\nendstream".getBytes(StandardCharsets.ISO_8859_1));
                }
                out.write("\nendobj\n".getBytes(StandardCharsets.ISO_8859_1));
            }
            int xref = out.size();
            StringBuilder tail = new StringBuilder("xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n");
            for (int off : offsets) tail.append(String.format("%010d 00000 n \n", off));
            tail.append("trailer\n<< /Size ").append(objects.length + 1).append(" /Root 1 0 R >>\nstartxref\n")
                .append(xref).append("\n%%EOF\n");
            out.write(tail.toString().getBytes(StandardCharsets.ISO_8859_1));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return out.toByteArray();
    }

    private static List<String> wrap(String text, int width) {
        List<String> lines = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String word : text.split(" ")) {
            if (line.length() > 0 && line.length() + word.length() + 1 > width) {
                lines.add(line.toString());
                line.setLength(0);
            }
            if (line.length() > 0) line.append(' ');
            line.append(word);
        }
        if (line.length() > 0) lines.add(line.toString());
        return lines;
    }

    /** ASCII only, with the three characters PDF string syntax reserves escaped. */
    private static String pdfEscape(String s) {
        return s.replaceAll("[^\\x20-\\x7E]", "-")
                .replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)");
    }
}
