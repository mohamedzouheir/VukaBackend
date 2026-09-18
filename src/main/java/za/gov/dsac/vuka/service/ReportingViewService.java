package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Assembles the views the office dashboard reads.
 *
 * <h2>Why this exists rather than the screens querying repositories</h2>
 *
 * Section 10 of the frontend design has one rule the backend has to make possible: a number never
 * appears without its provenance, in the same visual unit as the number. That means the row a
 * screen renders has to carry the figure, the cell it was read from, the documents attached to it,
 * the criteria those documents satisfy and the name of the person who confirmed it, all together.
 * Assembling that in each controller would produce four slightly different versions of one row,
 * and the reviewer and the Director-General would end up looking at two versions of one fact.
 *
 * <h2>The rule every method here obeys</h2>
 *
 * Absent stays absent. A target with no result carries a null actual, not a zero, all the way to
 * the wire. The difference between not done and not reported is the entire subject of this product
 * and a service layer that coalesces a null to zero destroys it before the interface ever sees it.
 */
@Service
public class ReportingViewService {

    /** Every date in this system is a South African reporting date. */
    private static final ZoneId ZA = ZoneId.of("Africa/Johannesburg");

    private final PublicEntityRepository entities;
    private final FinancialYearRepository years;
    private final ReportingPeriodRepository periods;
    private final SubmissionRepository submissions;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final ExtractionResultRepository extractions;
    private final DocumentRecordRepository documents;
    private final AllocationRepository allocations;
    private final CommentRepository comments;
    private final RiskScoreRepository riskScores;

    public ReportingViewService(PublicEntityRepository entities, FinancialYearRepository years,
                                ReportingPeriodRepository periods, SubmissionRepository submissions,
                                TargetRepository targets, TargetResultRepository results,
                                ExtractionResultRepository extractions,
                                DocumentRecordRepository documents, AllocationRepository allocations,
                                CommentRepository comments, RiskScoreRepository riskScores) {
        this.entities = entities;
        this.years = years;
        this.periods = periods;
        this.submissions = submissions;
        this.targets = targets;
        this.results = results;
        this.extractions = extractions;
        this.documents = documents;
        this.allocations = allocations;
        this.comments = comments;
        this.riskScores = riskScores;
    }

    /* ================================================================== */
    /* views                                                               */
    /* ================================================================== */

    public record PeriodView(UUID periodId, String financialYear, Integer quarter, String label,
                             String periodStart, String periodEnd, String dueDate,
                             String deadlineBasis, boolean statutory, Integer daysRemaining,
                             boolean open) {}

    public record SubmissionRow(UUID submissionId, UUID entityId, String entityName,
                                UUID periodId, String periodLabel, String status, String channel,
                                String createdAt, String submittedAt, String submittedByName,
                                String reviewedByName, String reviewedAt, String returnReason,
                                Integer daysLate, int targetCount, int confirmedCount,
                                int evidenceCount) {}

    public record EvidenceView(UUID documentId, String fileName, String documentType,
                               Long sizeBytes, String uploadedAt, String uploadedByName,
                               List<String> agsaCriteria) {}

    public record IndicatorRowView(UUID targetId, String indicatorRef, String indicator,
                                   String unitOfMeasure, BigDecimal annualTarget,
                                   BigDecimal quarterTarget, BigDecimal actual, BigDecimal variance,
                                   BigDecimal variancePercent, String varianceExplanation,
                                   String status, String sourceLocation, UUID extractionId,
                                   String extractedValue, boolean needsManualMatch,
                                   boolean confirmed, String confirmedByName, String confirmedAt,
                                   String noResultReason, List<EvidenceView> evidence,
                                   List<String> agsaCriteria, boolean traceable,
                                   Integer targetVersion, String revisionTrigger,
                                   String retablingReference, boolean disputed,
                                   String disputeComment) {}

    public record EntityBlock(UUID entityId, String name, String shortName, String sector,
                              String pfmaSchedule, String reportingLine, boolean publiclyVisible) {}

    public record SourceDocumentBlock(UUID documentId, String fileName) {}

    public record ExtractionView(UUID id, UUID targetId, String indicatorRef, String fieldName,
                                 String extractedValue, String sourceLocation,
                                 BigDecimal confidence, boolean needsManualMatch,
                                 String targetIndicator) {}

    public record SubmissionDetail(SubmissionRow submission, PeriodView period, EntityBlock entity,
                                   Object risk, List<IndicatorRowView> rows,
                                   List<ExtractionView> unmatched, SourceDocumentBlock sourceDocument) {}

    /**
     * One comment as the office surface reads it.
     *
     * @param parentId the comment this answers, or null where it opened a thread
     * @param resolved whether the point has been closed. A closed dispute is history, not a dispute
     */
    public record CommentView(UUID commentId, String body, String authorName, String authorRole,
                              String createdAt, String anchorType, UUID anchorId,
                              String indicatorRef, UUID parentId, boolean resolved) {}

    public record AllocationView(String financialYear, BigDecimal amount, String basis, String source) {}

    public record ChainView(BigDecimal allocated, String allocatedCitation,
                            Integer promisedTargetCount, String promisedCitation,
                            Integer reportedCount, Integer reportedOfCount, String reportedCitation,
                            Integer verifiedCount, Integer verifiedOfCount, String verifiedCitation,
                            List<AllocationView> allocations, Integer targetsWithNoResult,
                            Integer figuresWithNoEvidence) {}

    public record UnitCostHistoryPoint(String financialYear, BigDecimal unitCost) {}

    public record UnitCostView(String indicatorRef, String indicator, String unitOfMeasure,
                               BigDecimal plannedSpend, BigDecimal plannedVolume,
                               BigDecimal plannedUnitCost, BigDecimal actualSpend,
                               BigDecimal actualVolume, BigDecimal actualUnitCost,
                               BigDecimal variancePercent, String verdict,
                               List<UnitCostHistoryPoint> history) {}

    /* ================================================================== */
    /* periods                                                             */
    /* ================================================================== */

    /**
     * Every period of the current financial year.
     *
     * <p>The interface never asks for what the system can derive, so the quarter is not a dropdown
     * anywhere: {@code open} marks the periods whose window has started, and the screens default to
     * the last of those.
     */
    public List<PeriodView> periodsForCurrentYear() {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return List.of();
        LocalDate today = LocalDate.now(ZA);
        return periods.findByFinancialYearIdOrderByQuarterAsc(fy.getId()).stream()
                .map(p -> toPeriodView(p, fy, today))
                .toList();
    }

    public PeriodView toPeriodView(ReportingPeriod p) {
        FinancialYear fy = p.getFinancialYear();
        return toPeriodView(p, fy, LocalDate.now(ZA));
    }

    private PeriodView toPeriodView(ReportingPeriod p, FinancialYear fy, LocalDate today) {
        LocalDate due = p.getSubmissionDueDate();
        Integer daysRemaining = due == null ? null : (int) ChronoUnit.DAYS.between(today, due);
        boolean open = p.getPeriodStart() != null && !p.getPeriodStart().isAfter(today);

        return new PeriodView(
                p.getId(),
                fy == null ? null : fy.getLabel(),
                p.getQuarter(),
                p.getLabel(),
                str(p.getPeriodStart()),
                str(p.getPeriodEnd()),
                str(due),
                p.getDeadlineBasis() == null ? null : p.getDeadlineBasis().name(),
                // isStatutory is on the entity because it decides whether the lateness signal may
                // reach full weight, and the interface has to say which kind of date it is showing.
                p.isStatutory(),
                daysRemaining,
                open);
    }

    /** The most recent period whose window has opened, which is what every screen defaults to. */
    public UUID currentPeriodId() {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return null;
        LocalDate today = LocalDate.now(ZA);
        return periods.findByFinancialYearIdOrderByQuarterAsc(fy.getId()).stream()
                .filter(p -> p.getPeriodStart() != null && !p.getPeriodStart().isAfter(today))
                .reduce((a, b) -> b)
                .map(ReportingPeriod::getId)
                .orElse(null);
    }

    /**
     * The most recent period whose due date has passed, which is what the Department's screens
     * default to. Falls back to {@link #currentPeriodId()} before the first due date of the year.
     *
     * <p>A reporter works on the quarter that is open. A reviewer works on the quarter that has
     * fallen due, because until then there is nothing to review and every entity reads as
     * outstanding. In September those are Q2 and Q1 respectively, and a single default would be
     * wrong for one of them.
     */
    public UUID reviewPeriodId() {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return null;
        LocalDate today = LocalDate.now(ZA);
        return periods.findByFinancialYearIdOrderByQuarterAsc(fy.getId()).stream()
                .filter(p -> p.getSubmissionDueDate() != null && p.getSubmissionDueDate().isBefore(today))
                .reduce((a, b) -> b)
                .map(ReportingPeriod::getId)
                .orElseGet(this::currentPeriodId);
    }

    /* ================================================================== */
    /* submissions                                                         */
    /* ================================================================== */

    @Transactional(readOnly = true)
    public List<SubmissionRow> submissionRows(UUID entityId, UUID periodId, String status) {
        List<Submission> list;
        if (entityId != null) {
            list = submissions.findByEntityIdOrderByCreatedAtDesc(entityId);
        } else if (periodId != null) {
            list = submissions.findByReportingPeriodId(periodId);
        } else {
            list = submissions.findAllByOrderByCreatedAtDesc();
        }

        return list.stream()
                .filter(s -> periodId == null || periodId.equals(s.getReportingPeriod().getId()))
                .filter(s -> status == null || status.equalsIgnoreCase(String.valueOf(s.getStatus())))
                .map(this::toSubmissionRow)
                .toList();
    }

    @Transactional(readOnly = true)
    public SubmissionRow toSubmissionRow(Submission s) {
        PublicEntity e = s.getEntity();
        ReportingPeriod p = s.getReportingPeriod();
        UUID fyId = p.getFinancialYear() == null ? null : p.getFinancialYear().getId();

        int targetCount = fyId == null ? 0
                : (int) targets.countByEntityIdAndFinancialYearId(e.getId(), fyId);

        List<TargetResult> rows = results.findBySubmissionId(s.getId());
        // Distinct targets, not rows. Results are append-only, so a figure corrected after a return
        // has two rows, and counting rows reported 41 of 40 targets.
        int confirmed = (int) rows.stream()
                .filter(r -> r.getConfirmedAt() != null && r.getTarget() != null)
                .map(r -> r.getTarget().getId())
                .distinct()
                .count();

        int evidence = (int) documents.findBySubmissionId(s.getId()).stream()
                .filter(d -> d.getDocumentType() != Enums.DocumentType.REPORTING_TEMPLATE)
                .count();

        return new SubmissionRow(
                s.getId(), e.getId(), e.getName(), p.getId(), p.getLabel(),
                String.valueOf(s.getStatus()), String.valueOf(s.getChannel()),
                str(s.getCreatedAt()), str(s.getSubmittedAt()), s.getSubmittedByName(),
                // The reviewer's display name is not stored on the submission, only their uid.
                // Showing the uid would be worse than saying so, so this stays null and the
                // interface says "reviewed" without inventing a name.
                null,
                str(s.getReviewedAt()), s.getReturnReason(),
                daysLate(s, p), targetCount, confirmed, evidence);
    }

    /**
     * Lateness in whole days, signed.
     *
     * <p>Negative means early, which the interface renders as "two days before the due date". The
     * risk engine has its own, more careful, measure that distinguishes a departmental instruction
     * from a statutory date; this one is for display and is not used for scoring.
     */
    private Integer daysLate(Submission s, ReportingPeriod p) {
        if (s.getSubmittedAt() == null || p.getSubmissionDueDate() == null) return null;
        LocalDate submitted = s.getSubmittedAt().atZone(ZA).toLocalDate();
        return (int) ChronoUnit.DAYS.between(p.getSubmissionDueDate(), submitted);
    }

    /**
     * One submission, with every indicator carrying its provenance.
     *
     * <p>This is what the extraction review screen and the submission review screen both read, and
     * they read the same thing on purpose. The reporter sees the figure they are about to stand
     * behind; the reviewer sees the figure and who stood behind it. Building those from one method
     * is what stops the two screens disagreeing about what was filed.
     */
    @Transactional(readOnly = true)
    public SubmissionDetail submissionDetail(Submission detached, Object risk) {
        // Re-read inside this transaction. The caller loaded it in its own, now closed, session,
        // so its lazy period and entity proxies throw on first touch with open-in-view off.
        Submission s = submissions.findById(detached.getId()).orElseThrow();
        PublicEntity e = s.getEntity();
        ReportingPeriod p = s.getReportingPeriod();
        FinancialYear fy = p.getFinancialYear();

        List<Target> registered = fy == null ? List.of()
                : targets.findByEntityIdAndFinancialYearId(e.getId(), fy.getId());

        List<ExtractionResult> parsed = extractions.findBySubmissionId(s.getId());
        List<TargetResult> filed = results.findBySubmissionId(s.getId());

        // The template upload itself, so a source cell can be opened at the file it came from.
        DocumentRecord template = documents.findBySubmissionId(s.getId()).stream()
                .filter(d -> d.getDocumentType() == Enums.DocumentType.REPORTING_TEMPLATE)
                .reduce((a, b) -> b)
                .orElse(null);

        // Per target dispute comments, anchored on the target rather than on the submission, so a
        // returned figure says which figure it was. Newest open dispute wins where there are two.
        Map<UUID, String> disputes = new HashMap<>();
        for (Comment c : comments.findByEntityIdOrderByCreatedAtDesc(e.getId())) {
            if (isOpenDispute(c)) disputes.putIfAbsent(c.getAnchorId(), c.getBody());
        }

        List<IndicatorRowView> rows = new ArrayList<>();
        for (Target t : registered) {
            rows.add(toIndicatorRow(s, p, t, parsed, filed, disputes));
        }

        // Rows the parser read that matched no registered target. Shown, never dropped.
        List<ExtractionView> unmatched = parsed.stream()
                .filter(x -> x.getTarget() == null)
                .filter(x -> "actualValue".equals(x.getFieldName()) || x.getFieldName() == null)
                .map(x -> new ExtractionView(x.getId(), null, x.getIndicatorRef(), x.getFieldName(),
                        x.getExtractedValue(), x.getSourceLocation(), x.getConfidence(),
                        x.isNeedsManualMatch(), null))
                .toList();

        return new SubmissionDetail(
                toSubmissionRow(s),
                toPeriodView(p, fy, LocalDate.now(ZA)),
                new EntityBlock(e.getId(), e.getName(), e.getShortName(),
                        String.valueOf(e.getSector()),
                        e.getPfmaSchedule() == null ? null : e.getPfmaSchedule().name(),
                        reportingLine(e.getPfmaSchedule()), e.isPubliclyVisible()),
                risk,
                rows,
                unmatched,
                template == null ? null : new SourceDocumentBlock(template.getId(), template.getFileName()));
    }

    private IndicatorRowView toIndicatorRow(Submission s, ReportingPeriod p, Target t,
                                            List<ExtractionResult> parsed, List<TargetResult> filed,
                                            Map<UUID, String> disputes) {

        // What the parser read for this target's actual, with the cell it came from.
        ExtractionResult extraction = parsed.stream()
                .filter(x -> x.getTarget() != null && x.getTarget().getId().equals(t.getId()))
                .filter(x -> "actualValue".equals(x.getFieldName()))
                .reduce((a, b) -> b)
                .orElse(null);

        // The latest confirmation wins. Chosen by time rather than by list position, because the
        // query behind the list carries no ORDER BY and Postgres promises no order without one.
        TargetResult result = filed.stream()
                .filter(r -> r.getTarget() != null && r.getTarget().getId().equals(t.getId()))
                .max(Comparator.comparing(TargetResult::getConfirmedAt,
                        Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);

        BigDecimal quarterTarget = quarterTarget(t, p.getQuarter());
        BigDecimal actual = result == null ? null : result.getActualValue();

        BigDecimal variance = null;
        BigDecimal variancePercent = null;
        if (actual != null && quarterTarget != null) {
            variance = actual.subtract(quarterTarget);
            if (quarterTarget.signum() != 0) {
                variancePercent = variance.multiply(BigDecimal.valueOf(100))
                        .divide(quarterTarget, 1, RoundingMode.HALF_UP);
            }
        }

        // A confirmed row with no actual is a recorded absence rather than a missing row, and the
        // reason the reporter gave travels with it.
        String noResultReason = null;
        if (result != null && result.getActualValue() == null) {
            noResultReason = result.getVarianceExplanation() == null
                    ? "No reason was recorded." : result.getVarianceExplanation();
        }

        List<DocumentRecord> evidence = documents
                .findBySubmissionIdAndTargetIdOrderByUploadedAtAsc(s.getId(), t.getId());

        List<EvidenceView> evidenceViews = evidence.stream()
                .map(d -> new EvidenceView(d.getId(), d.getFileName(),
                        d.getDocumentType() == null ? null : d.getDocumentType().name(),
                        d.getSizeBytes(), str(d.getUploadedAt()),
                        // Documents store the uploader's uid rather than their name. Rendering a
                        // uid to a reviewer is noise, so the name stays absent until a UserProfile
                        // row exists for it.
                        null,
                        d.getAgsaCriterion() == null ? List.of() : List.of(d.getAgsaCriterion().name())))
                .toList();

        List<String> criteria = evidence.stream()
                .map(DocumentRecord::getAgsaCriterion)
                .filter(Objects::nonNull)
                .map(Enum::name)
                .distinct()
                .toList();

        // Traceable is the Auditor-General's reliability test, not a count of files. A figure with
        // documents attached but no criterion recorded is attached, not traceable, and the
        // interface says so in those words.
        boolean traceable = !evidence.isEmpty() && !criteria.isEmpty();

        return new IndicatorRowView(
                t.getId(), t.getIndicatorRef(), t.getIndicator(), t.getUnitOfMeasure(),
                t.getAnnualTarget(), quarterTarget, actual, variance, variancePercent,
                result == null ? null : result.getVarianceExplanation(),
                result == null ? "NOT_STARTED" : String.valueOf(result.getStatus()),
                extraction == null ? null : extraction.getSourceLocation(),
                extraction == null ? null : extraction.getId(),
                extraction == null ? null : extraction.getExtractedValue(),
                extraction != null && extraction.isNeedsManualMatch(),
                result != null && result.getConfirmedAt() != null,
                result == null ? null : result.getConfirmedByName(),
                result == null ? null : str(result.getConfirmedAt()),
                noResultReason,
                evidenceViews, criteria, traceable,
                t.getVersion(),
                t.getRevisionTrigger() == null ? null : t.getRevisionTrigger().name(),
                t.getRetablingReference(),
                disputes.containsKey(t.getId()),
                disputes.get(t.getId()));
    }

    public static BigDecimal quarterTarget(Target t, Integer quarter) {
        if (quarter == null) return t.getAnnualTarget();
        return switch (quarter) {
            case 1 -> t.getQ1Target();
            case 2 -> t.getQ2Target();
            case 3 -> t.getQ3Target();
            case 4 -> t.getQ4Target();
            default -> t.getAnnualTarget();
        };
    }

    /* ================================================================== */
    /* comments                                                            */
    /* ================================================================== */

    @Transactional(readOnly = true)
    public List<CommentView> commentsFor(Submission detached) {
        // Re-read inside this transaction, for the same reason as submissionDetail.
        Submission s = submissions.findById(detached.getId()).orElseThrow();
        UUID entityId = s.getEntity().getId();
        Map<UUID, String> refByTarget = new HashMap<>();
        FinancialYear fy = s.getReportingPeriod().getFinancialYear();
        if (fy != null) {
            for (Target t : targets.findByEntityIdAndFinancialYearId(entityId, fy.getId())) {
                refByTarget.put(t.getId(), t.getIndicatorRef());
            }
        }

        return comments.findByEntityIdOrderByCreatedAtDesc(entityId).stream()
                .map(c -> new CommentView(c.getId(), c.getBody(), c.getAuthorName(),
                        c.getAuthorRole() == null ? null : c.getAuthorRole().name(),
                        str(c.getCreatedAt()),
                        c.getAnchorType() == null ? null : c.getAnchorType().name(),
                        c.getAnchorId(),
                        c.getAnchorId() == null ? null : refByTarget.get(c.getAnchorId()),
                        c.getParentId(), c.isResolved()))
                .toList();
    }

    /**
     * Whether a comment disputes the figure it is anchored to.
     *
     * <p>Not every comment on a target is a dispute, and before comments could be answered and
     * closed the difference did not matter. Now it does. A reporter's reply saying "corrected"
     * would otherwise be shown to them as "the Department disputed this figure", and a dispute
     * DSAC has since closed would stay on the row forever. A dispute is a comment that opened a
     * thread on a target, was written by a DSAC role, and is still open.
     *
     * <p>The office surface recomputes this from the live comment list between reloads, so the
     * same rule is written out again in {@code frontend/src/lib/useLiveComments.ts}. Change both.
     */
    public static boolean isOpenDispute(Comment c) {
        return c.getAnchorType() == Enums.AnchorType.TARGET
                && c.getAnchorId() != null
                && c.getParentId() == null
                && !c.isResolved()
                && c.getAuthorRole() != null
                && c.getAuthorRole() != Enums.Role.ENTITY_REPORTER;
    }

    /* ================================================================== */
    /* the chain                                                           */
    /* ================================================================== */

    /**
     * The four boxes at the top of the drilldown: allocated, promised, reported, verified.
     *
     * <p>Each carries its citation, because a figure with no source is what this product exists to
     * replace. Where a figure cannot be computed it comes back null and the interface renders a
     * dash and the reason. None of the four is ever a zero standing in for an absence.
     */
    @Transactional(readOnly = true)
    public ChainView chainFor(UUID entityId, UUID periodId) {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) {
            return new ChainView(null, null, null, null, null, null, null, null, null, null,
                    List.of(), null, null);
        }

        List<Allocation> allocationRows = allocations.findByEntityIdAndFinancialYearId(entityId, fy.getId());
        BigDecimal allocated = allocationRows.isEmpty() ? null
                : allocationRows.stream().map(Allocation::getAmount).filter(Objects::nonNull)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Target> registered = targets.findByEntityIdAndFinancialYearId(entityId, fy.getId());
        Integer promised = registered.isEmpty() ? null : registered.size();

        UUID period = periodId != null ? periodId : reviewPeriodId();
        Submission submission = period == null ? null
                : submissions.findByEntityIdAndReportingPeriodId(entityId, period).orElse(null);

        Integer reported = null;
        Integer verified = null;
        Integer noResult = null;
        Integer noEvidence = null;
        String reportedCitation = null;

        if (submission != null && !registered.isEmpty()) {
            List<TargetResult> filed = results.findBySubmissionId(submission.getId());
            long withResult = filed.stream()
                    .filter(r -> r.getActualValue() != null && r.getConfirmedAt() != null)
                    .count();
            reported = (int) withResult;
            noResult = registered.size() - (int) withResult;

            int verifiedCount = 0;
            int unverifiable = 0;
            for (TargetResult r : filed) {
                if (r.getTarget() == null || r.getActualValue() == null) continue;
                boolean hasEvidence = !documents
                        .findBySubmissionIdAndTargetIdOrderByUploadedAtAsc(
                                submission.getId(), r.getTarget().getId())
                        .isEmpty();
                if (hasEvidence) verifiedCount++; else unverifiable++;
            }
            verified = verifiedCount;
            noEvidence = unverifiable;

            reportedCitation = submission.getReportingPeriod().getLabel()
                    + (submission.getSubmittedAt() == null ? ", not yet submitted" : ", submitted");
        }

        // The allocation basis is the ENE line the seed loaded, and the wording differs by year
        // because two of the four years are audited outcome and two are not.
        List<AllocationView> history = allocationHistory(entityId);

        return new ChainView(
                allocated,
                allocated == null ? null
                        : "Estimates of National Expenditure 2026, Vote 37, Table 37.3, " + fy.getLabel(),
                promised,
                promised == null ? null : "Annual Performance Plan " + fy.getLabel() + ", as tabled",
                reported,
                registered.isEmpty() ? null : registered.size(),
                reportedCitation,
                verified,
                reported,
                verified == null ? null : "Evidence attached and confirmed by a named official",
                history,
                noResult,
                noEvidence);
    }

    /** Allocation across every financial year on record, oldest first. */
    @Transactional(readOnly = true)
    public List<AllocationView> allocationHistory(UUID entityId) {
        List<AllocationView> out = new ArrayList<>();
        List<FinancialYear> all = new ArrayList<>();
        years.findAll().forEach(all::add);
        all.sort(Comparator.comparing(FinancialYear::getLabel));

        for (FinancialYear fy : all) {
            List<Allocation> rows = allocations.findByEntityIdAndFinancialYearId(entityId, fy.getId());
            if (rows.isEmpty()) continue;   // absent stays absent, no zero row
            BigDecimal total = rows.stream().map(Allocation::getAmount).filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            out.add(new AllocationView(fy.getLabel(), total, null,
                    "ENE 2026, Vote 37, Table 37.3"));
        }
        return out;
    }

    /* ================================================================== */
    /* unit cost                                                           */
    /* ================================================================== */

    /**
     * Unit cost per indicator, with both sides of the division shown.
     *
     * <p>An indicator with only one side is not returned at all. A unit cost derived from a spend
     * with no delivery, or a delivery with no spend, is a number that looks like analysis and is
     * not, and the honest response is to omit the row rather than to publish a half of it.
     */
    @Transactional(readOnly = true)
    public List<UnitCostView> unitCostsFor(UUID entityId, UUID targetId, UnitCostService unitCost) {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return List.of();

        List<UnitCostView> out = new ArrayList<>();
        for (Target t : targets.findByEntityIdAndFinancialYearId(entityId, fy.getId())) {
            if (targetId != null && !targetId.equals(t.getId())) continue;

            List<TargetResult> rows = results.findByTargetId(t.getId());
            BigDecimal actualSpend = rows.stream().map(TargetResult::getSpendToDate)
                    .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal actualVolume = rows.stream().map(TargetResult::getActualValue)
                    .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal actualUnitCost = actualVolume.signum() == 0 || actualSpend.signum() == 0
                    ? null
                    : actualSpend.divide(actualVolume, 2, RoundingMode.HALF_UP);

            if (t.getPlannedUnitCost() == null && actualUnitCost == null) continue;

            BigDecimal plannedSpend = t.getPlannedUnitCost() == null || t.getAnnualTarget() == null
                    ? null
                    : t.getPlannedUnitCost().multiply(t.getAnnualTarget());

            UnitCostService.UnitCost uc = unitCost.compare(
                    t.getIndicatorRef(), t.getIndicator(), t.getUnitOfMeasure(),
                    t.getPlannedUnitCost(), actualUnitCost);

            out.add(new UnitCostView(
                    t.getIndicatorRef(), t.getIndicator(), t.getUnitOfMeasure(),
                    plannedSpend, t.getAnnualTarget(), t.getPlannedUnitCost(),
                    actualSpend.signum() == 0 ? null : actualSpend,
                    actualVolume.signum() == 0 ? null : actualVolume,
                    actualUnitCost, uc.variancePercent(), String.valueOf(uc.verdict()),
                    unitCostHistory(entityId, t.getIndicatorRef(), fy.getId())));
        }
        return out;
    }

    /**
     * The same indicator's unit cost in prior years.
     *
     * <p>Matched on indicator ref rather than on target id, because a target is versioned and a
     * new financial year gets a new row. The ref is the thing that persists across years, which is
     * also why the template matches on it.
     */
    private List<UnitCostHistoryPoint> unitCostHistory(UUID entityId, String indicatorRef, UUID currentFyId) {
        List<UnitCostHistoryPoint> out = new ArrayList<>();
        List<FinancialYear> all = new ArrayList<>();
        years.findAll().forEach(all::add);
        all.sort(Comparator.comparing(FinancialYear::getLabel).reversed());

        for (FinancialYear fy : all) {
            if (fy.getId().equals(currentFyId)) continue;
            Target t = targets
                    .findByEntityIdAndFinancialYearIdAndIndicatorRef(entityId, fy.getId(), indicatorRef)
                    .orElse(null);
            if (t == null) continue;

            List<TargetResult> rows = results.findByTargetId(t.getId());
            BigDecimal spend = rows.stream().map(TargetResult::getSpendToDate)
                    .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal volume = rows.stream().map(TargetResult::getActualValue)
                    .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);

            out.add(new UnitCostHistoryPoint(fy.getLabel(),
                    volume.signum() == 0 || spend.signum() == 0
                            ? null
                            : spend.divide(volume, 2, RoundingMode.HALF_UP)));
        }
        return out;
    }

    /* ================================================================== */
    /* administration                                                      */
    /* ================================================================== */

    public record AdminEntityRow(UUID entityId, String name, String sector,
                                 boolean publiclyVisible, int targetCount) {}

    @Transactional(readOnly = true)
    public List<AdminEntityRow> adminEntityRows() {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        List<AdminEntityRow> out = new ArrayList<>();
        for (PublicEntity e : entities.findAll()) {
            int count = fy == null ? 0
                    : (int) targets.countByEntityIdAndFinancialYearId(e.getId(), fy.getId());
            out.add(new AdminEntityRow(e.getId(), e.getName(), String.valueOf(e.getSector()),
                    e.isPubliclyVisible(), count));
        }
        out.sort(Comparator.comparing(AdminEntityRow::name));
        return out;
    }

    /** The allocation total a portfolio row carries, so a tile does not cost 28 requests. */
    @Transactional(readOnly = true)
    public Map<UUID, BigDecimal> allocationByEntityForCurrentYear() {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return Map.of();

        Map<UUID, BigDecimal> out = new HashMap<>();
        for (PublicEntity e : entities.findAll()) {
            List<Allocation> rows = allocations.findByEntityIdAndFinancialYearId(e.getId(), fy.getId());
            if (rows.isEmpty()) continue;   // no row means no figure, not a zero
            out.put(e.getId(), rows.stream().map(Allocation::getAmount).filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add));
        }
        return out;
    }

    /* ================================================================== */
    /* helpers                                                             */
    /* ================================================================== */

    /**
     * Who this entity owes its quarterly performance report to, and under what.
     *
     * <p>Duplicated from ExportService on purpose rather than shared: the export carries it as a
     * caveat line in a file that outlives this system, and the interface carries it as a subtitle.
     * Coupling the two would mean a wording change for one silently changing the other.
     */
    public static String reportingLine(Enums.PfmaSchedule schedule) {
        if (schedule == null) return "Reporting line not determined.";
        return switch (schedule) {
            case SCHEDULE_3A, SCHEDULE_3C ->
                    "reports to its executive authority under Treasury Regulation 30.2.1";
            case SCHEDULE_3B, SCHEDULE_2 ->
                    "reports under National Treasury's quarterly non-financial reporting guideline";
            case SCHEDULE_1 ->
                    "constitutional institution, reporting under its own establishing Act";
            case SCHEDULE_3D -> "reporting line set by its establishing legislation";
        };
    }

    private static String str(LocalDate d) { return d == null ? null : d.toString(); }

    private static String str(java.time.Instant i) { return i == null ? null : i.toString(); }
}
