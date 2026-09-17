package za.gov.dsac.vuka.web;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.ReportingViewService;
import za.gov.dsac.vuka.service.SubmissionService;
import za.gov.dsac.vuka.service.TemplateWriter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.util.*;

/**
 * The entity-facing submission flow: upload, review what was read, confirm, submit.
 *
 * The confirm step is the one that matters. It writes the caller's uid onto every
 * performance figure, which is what turns "a machine read this" into "a named person
 * stands behind this".
 */
@RestController
@RequestMapping("/api/submissions")
public class SubmissionController {

    private final SubmissionService service;
    private final SubmissionRepository submissions;
    private final ExtractionResultRepository extractions;
    private final TargetRepository targets;
    private final ReportingViewService views;
    private final TemplateWriter templateWriter;
    private final DocumentRecordRepository documents;
    private final CommentRepository comments;
    private final RiskScoreRepository riskScores;
    private final PublicEntityRepository entities;
    private final ReportingPeriodRepository periods;

    public SubmissionController(SubmissionService service, SubmissionRepository submissions,
                                ExtractionResultRepository extractions, TargetRepository targets,
                                ReportingViewService views, TemplateWriter templateWriter,
                                DocumentRecordRepository documents, CommentRepository comments,
                                RiskScoreRepository riskScores, PublicEntityRepository entities,
                                ReportingPeriodRepository periods) {
        this.service = service;
        this.submissions = submissions;
        this.extractions = extractions;
        this.targets = targets;
        this.views = views;
        this.templateWriter = templateWriter;
        this.documents = documents;
        this.comments = comments;
        this.riskScores = riskScores;
        this.entities = entities;
        this.periods = periods;
    }

    /**
     * The tenancy check, in one place.
     *
     * <p>A reporter's entity comes off the token. A caller who may not read this submission gets
     * an empty optional and every endpoint turns that into a 404, never a 403, for the same reason
     * ExportController does: confirming that a record exists but belongs to somebody else is
     * itself a disclosure about that somebody else.
     */
    private Optional<Submission> readable(UUID submissionId, VukaPrincipal who) {
        return submissions.findById(submissionId)
                .filter(s -> who == null || who.canRead(s.getEntity().getId().toString()));
    }

    // ---------- open ----------

    public record OpenRequest(UUID entityId, UUID periodId, String channel) {}

    @PostMapping("/open")
    @PreAuthorize("hasRole('ENTITY_REPORTER')")
    public ResponseEntity<?> open(@RequestBody OpenRequest req, @AuthenticationPrincipal VukaPrincipal who) {
        if (!who.canRead(req.entityId().toString())) return ResponseEntity.status(403).build();
        Enums.SubmissionChannel channel;
        try {
            channel = Enums.SubmissionChannel.valueOf(req.channel().toUpperCase());
        } catch (Exception e) {
            channel = Enums.SubmissionChannel.WEB;
        }
        Submission s = service.openDraft(req.entityId(), req.periodId(), channel, who);
        return ResponseEntity.ok(Map.of("submissionId", s.getId(), "status", String.valueOf(s.getStatus())));
    }

    // ---------- upload and parse ----------

    @PostMapping("/{submissionId}/upload")
    @PreAuthorize("hasRole('ENTITY_REPORTER')")
    public ResponseEntity<?> upload(@PathVariable UUID submissionId,
                                    @RequestParam("file") MultipartFile file,
                                    @AuthenticationPrincipal VukaPrincipal who) throws Exception {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.status(403).build();

        var report = service.ingestTemplate(submissionId, file, who);
        return ResponseEntity.ok(report);
    }

    // ---------- what the parser read, with its sources ----------

    public record ExtractionView(UUID id, UUID targetId, String indicatorRef, String fieldName,
                                 String extractedValue, String sourceLocation,
                                 BigDecimal confidence, boolean needsManualMatch,
                                 String targetIndicator) {}

    /**
     * Everything read from the upload, grouped for the confirmation screen.
     *
     * Each row carries the cell it came from so the reporter, and later the reviewer,
     * can open the source rather than taking the number on trust.
     */
    @GetMapping("/{submissionId}/extractions")
    public ResponseEntity<List<ExtractionView>> extractions(@PathVariable UUID submissionId,
                                                            @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.status(403).build();

        List<ExtractionView> views = extractions.findBySubmissionId(submissionId).stream()
                .map(e -> new ExtractionView(
                        e.getId(),
                        e.getTarget() == null ? null : e.getTarget().getId(),
                        e.getIndicatorRef(), e.getFieldName(), e.getExtractedValue(),
                        e.getSourceLocation(), e.getConfidence(), e.isNeedsManualMatch(),
                        e.getTarget() == null ? null : e.getTarget().getIndicator()))
                .toList();

        return ResponseEntity.ok(views);
    }

    // ---------- confirm ----------

    public record ConfirmRequest(List<Row> rows) {
        public record Row(UUID targetId, BigDecimal actualValue,
                          BigDecimal spendToDate, String varianceExplanation) {}
    }

    /**
     * Writes performance data. Only a signed-in reporter can reach this, and their uid
     * goes onto every row.
     */
    @PostMapping("/{submissionId}/confirm")
    @PreAuthorize("hasRole('ENTITY_REPORTER')")
    public ResponseEntity<?> confirm(@PathVariable UUID submissionId,
                                     @RequestBody ConfirmRequest req,
                                     @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.status(403).build();

        List<SubmissionService.ConfirmedRow> rows = req.rows().stream()
                .map(r -> new SubmissionService.ConfirmedRow(
                        r.targetId(), r.actualValue(), r.spendToDate(), r.varianceExplanation()))
                .toList();

        int written = service.confirm(submissionId, rows, who);
        return ResponseEntity.ok(Map.of("confirmed", written, "by", who.name()));
    }

    // ---------- submit ----------

    @PostMapping("/{submissionId}/submit")
    @PreAuthorize("hasRole('ENTITY_REPORTER')")
    public ResponseEntity<?> submit(@PathVariable UUID submissionId,
                                    @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(service.submit(submissionId, who));
    }


    // ---------- what exists ----------

    /**
     * Submissions, filtered by whatever the caller is entitled to ask about.
     *
     * <p>A reporter may only list their own entity's, and the filter is applied from the token
     * rather than from the query string. There is deliberately no way for a reporter to omit the
     * entity and receive everything.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public List<ReportingViewService.SubmissionRow> list(
            @RequestParam(required = false) UUID entityId,
            @RequestParam(required = false) UUID periodId,
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal VukaPrincipal who) {

        UUID scope = entityId;
        if (who != null && !who.isDsac()) {
            // The entity is taken from the token, never from the path or the query. A reporter
            // asking for another entity is answered with their own, which is the same outcome as
            // having no way to ask.
            scope = who.entityId() == null ? null : UUID.fromString(who.entityId());
            if (scope == null) return List.of();
        }

        return views.submissionRows(scope, periodId, status);
    }

    /**
     * One submission, with every indicator carrying its provenance.
     *
     * <p>Both review screens read this. The reporter sees the figure they are about to stand
     * behind, the reviewer sees the figure and who stood behind it, and they come from one method
     * so the two screens cannot disagree about what was filed.
     */
    @GetMapping("/{submissionId}")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public ResponseEntity<ReportingViewService.SubmissionDetail> detail(
            @PathVariable UUID submissionId, @AuthenticationPrincipal VukaPrincipal who) {

        Submission s = readable(submissionId, who).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();

        // The risk block is only for DSAC. A reporter sees their own reporting history on their
        // home screen, which is the same data the lateness signal reads, but the score itself is a
        // departmental management tool with weights the department chose, and publishing it to the
        // entity through this endpoint would be a different decision from the one we made.
        Object risk = null;
        if (who != null && who.isDsac()) {
            // Signals fetched with the score. Reading them lazily here throws, because
            // open-in-view is false and this method is not transactional.
            risk = riskScores
                    .findByEntityAndPeriodWithSignals(s.getEntity().getId(),
                            s.getReportingPeriod().getId())
                    .map(rs -> (Object) toRiskBlock(s.getEntity(), rs))
                    .orElse(null);
        }

        return ResponseEntity.ok(views.submissionDetail(s, risk));
    }

    private static RiskBlock toRiskBlock(PublicEntity e, RiskScore rs) {
        List<SignalBlock> signals = rs.getSignals().stream()
                .sorted(Comparator.comparing(RiskSignal::getContribution).reversed())
                .map(sig -> new SignalBlock(String.valueOf(sig.getType()), sig.getDescription(),
                        sig.getContribution(), sig.getWeight(), sig.getValue()))
                .toList();

        return new RiskBlock(e.getId(), e.getName(), e.getShortName(),
                String.valueOf(e.getSector()), String.valueOf(e.getEntityType()),
                rs.getScore(), String.valueOf(rs.getBand()), rs.getPreviousScore(),
                rs.getPreviousScore() == null ? null : rs.getScore().subtract(rs.getPreviousScore()),
                signals, null);
    }

    /**
     * The same shape DashboardController.PortfolioRow uses.
     *
     * <p>Repeated as a local record rather than shared, because the risk panel is one frontend
     * component reading one shape and it has to get that shape from every endpoint carrying a
     * score. A second shape would become a second component, and two explanations of one score is
     * exactly the failure the panel exists to prevent.
     */
    public record RiskBlock(UUID entityId, String name, String shortName, String sector,
                            String entityType, BigDecimal score, String band,
                            BigDecimal previousScore, BigDecimal movement,
                            List<SignalBlock> signals, BigDecimal totalAllocation) {}

    public record SignalBlock(String type, String description, BigDecimal contribution,
                              BigDecimal weight, BigDecimal value) {}

    /** The indicator rows on their own, for a screen that already has the header. */
    @GetMapping("/{submissionId}/rows")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public ResponseEntity<List<ReportingViewService.IndicatorRowView>> rows(
            @PathVariable UUID submissionId, @AuthenticationPrincipal VukaPrincipal who) {

        Submission s = readable(submissionId, who).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(views.submissionDetail(s, null).rows());
    }

    // ---------- the pre filled template ----------

    /**
     * UC-1. An .xlsx carrying this entity's registered targets, with the actuals column empty.
     *
     * <p>Handing a reporter a blank template is how an indicator name gets retyped, gets one
     * character wrong, and stops matching the parser. Pre filling the codes is the cheapest defect
     * prevention in the product.
     *
     * <p>Where no targets are registered the response says so and names who to contact rather than
     * producing an empty file, because an empty file reads as a system fault.
     */
    @GetMapping("/template")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','ADMIN')")
    public ResponseEntity<?> template(@RequestParam UUID entityId, @RequestParam UUID periodId,
                                      @AuthenticationPrincipal VukaPrincipal who) throws Exception {

        if (who != null && !who.canRead(entityId.toString())) return ResponseEntity.notFound().build();

        PublicEntity entity = entities.findById(entityId).orElse(null);
        ReportingPeriod period = periods.findById(periodId).orElse(null);
        if (entity == null || period == null) return ResponseEntity.notFound().build();

        UUID fyId = period.getFinancialYear() == null ? null : period.getFinancialYear().getId();
        List<Target> registered = fyId == null ? List.of()
                : targets.findByEntityIdAndFinancialYearId(entityId, fyId);

        if (registered.isEmpty()) {
            return ResponseEntity.status(409).body(Map.of(
                    "error", "no_targets_registered",
                    "message", "No targets are registered for " + entity.getName() + " for this "
                            + "financial year, so there is nothing to report against. An "
                            + "administrator loads targets from the entity's tabled Annual "
                            + "Performance Plan. Contact your DSAC reviewer rather than completing "
                            + "a blank template."));
        }

        byte[] xlsx = templateWriter.build(entity, period, registered);
        String name = templateWriter.fileName(entity, period);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + name)
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(xlsx);
    }

    // ---------- evidence ----------

    /**
     * UC-4. A document attached against one target.
     *
     * <p>Stored with its uploader, its content hash, its type and the Auditor-General's criterion
     * it is offered against. That last field is the difference between a document repository and
     * an audit readiness tool: an attendance register answers validity, a reconciliation against a
     * booking system answers completeness, and a folder of PDFs answers neither.
     *
     * <p>Permitted after submission. Withholding evidence is worse than late evidence.
     */
    @PostMapping("/{submissionId}/evidence")
    @PreAuthorize("hasRole('ENTITY_REPORTER')")
    public ResponseEntity<?> attachEvidence(@PathVariable UUID submissionId,
                                            @RequestParam("file") MultipartFile file,
                                            @RequestParam UUID targetId,
                                            @RequestParam(required = false) List<String> agsaCriteria,
                                            @AuthenticationPrincipal VukaPrincipal who)
            throws Exception {

        Submission s = readable(submissionId, who).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();

        Target target = targets.findById(targetId).orElse(null);
        if (target == null || !target.getEntity().getId().equals(s.getEntity().getId())) {
            // A target belonging to another entity is not a validation error worth explaining.
            return ResponseEntity.notFound().build();
        }

        // The schema holds one criterion per document row. Several criteria means several rows,
        // which is the honest shape: one file offered for three tests is three claims about it.
        List<Enums.AgsaCriterion> criteria = new ArrayList<>();
        if (agsaCriteria != null) {
            for (String c : agsaCriteria) {
                try {
                    criteria.add(Enums.AgsaCriterion.valueOf(c.toUpperCase()));
                } catch (IllegalArgumentException ignored) {
                    // An unrecognised criterion is dropped rather than stored as a guess.
                }
            }
        }

        String hash = sha256(file.getBytes());
        String storagePath = "uploads/" + s.getEntity().getId() + "/" + UUID.randomUUID();
        UUID firstId = null;

        // At least one row, even with no criterion recorded. The interface then reads the figure as
        // attached but not traceable, which is a real and different state from unverifiable.
        int rowsToWrite = Math.max(1, criteria.size());
        for (int i = 0; i < rowsToWrite; i++) {
            DocumentRecord doc = new DocumentRecord();
            doc.setEntity(s.getEntity());
            doc.setSubmission(s);
            doc.setTarget(target);
            doc.setDocumentType(Enums.DocumentType.QUARTERLY_REPORT);
            doc.setFileName(file.getOriginalFilename());
            doc.setStoragePath(storagePath);
            doc.setSizeBytes(file.getSize());
            doc.setVersion(1);
            doc.setUploadedByUid(who == null ? null : who.uid());
            doc.setUploadedAt(java.time.Instant.now());
            doc.setApprovalStatus(Enums.ApprovalStatus.PENDING);
            // A reviewer opening evidence six months later needs to know it is the file that was
            // attached rather than a file that replaced it.
            doc.setContentHash(hash);
            if (i < criteria.size()) doc.setAgsaCriterion(criteria.get(i));
            documents.save(doc);
            if (firstId == null) firstId = doc.getId();
        }

        return ResponseEntity.ok(Map.of(
                "documentId", firstId,
                "agsaCriteria", criteria.stream().map(Enum::name).toList()));
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder sb = new StringBuilder(digest.length * 2);
        for (byte b : digest) sb.append(Character.forDigit((b >> 4) & 0xF, 16))
                               .append(Character.forDigit(b & 0xF, 16));
        return sb.toString();
    }

    // ---------- comments, the per target dispute trail ----------

    /**
     * UC-14, and the mechanism behind UC-12.
     *
     * <p>A thread per entity, with each comment anchored on the target it is about. That anchor is
     * the whole point: a note against a specific indicator tells the entity exactly which figure
     * is disputed, where a single free text box for the whole submission makes them guess, correct
     * the wrong number, and lose another two weeks.
     */
    @GetMapping("/{submissionId}/comments")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public ResponseEntity<List<ReportingViewService.CommentView>> listComments(
            @PathVariable UUID submissionId, @AuthenticationPrincipal VukaPrincipal who) {

        Submission s = readable(submissionId, who).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(views.commentsFor(s));
    }

    public record CommentRequest(String body, UUID targetId) {}

    @PostMapping("/{submissionId}/comments")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','ADMIN')")
    public ResponseEntity<?> addComment(@PathVariable UUID submissionId,
                                        @RequestBody CommentRequest req,
                                        @AuthenticationPrincipal VukaPrincipal who) {

        Submission s = readable(submissionId, who).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (req.body() == null || req.body().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "A comment needs a body."));
        }

        Comment c = new Comment();
        c.setEntity(s.getEntity());
        // A comment with no target is about the filing as a whole. One with a target is about that
        // figure, and the entity is shown it against that figure only.
        c.setAnchorType(req.targetId() == null ? Enums.AnchorType.DOCUMENT : Enums.AnchorType.TARGET);
        c.setAnchorId(req.targetId() == null ? s.getId() : req.targetId());
        c.setAuthorUid(who == null ? null : who.uid());
        c.setAuthorName(who == null ? null : who.name());
        if (who != null && who.role() != null) {
            try {
                c.setAuthorRole(Enums.Role.valueOf(who.role()));
            } catch (IllegalArgumentException ignored) {
                // An unknown role on a token is an administration problem, not a reason to lose the
                // comment. The body and the author stay on the record either way.
            }
        }
        c.setBody(req.body().trim());
        c.setResolved(false);
        c.setCreatedAt(java.time.Instant.now());
        comments.save(c);

        return ResponseEntity.ok(new ReportingViewService.CommentView(
                c.getId(), c.getBody(), c.getAuthorName(),
                c.getAuthorRole() == null ? null : c.getAuthorRole().name(),
                c.getCreatedAt().toString(), c.getAnchorType().name(), c.getAnchorId(), null));
    }

    // ---------- review ----------

    public record ReviewRequest(boolean approve, String returnReason) {}

    /**
     * DSAC approves or returns.
     *
     * Note what is missing: there is no endpoint to edit a figure. A reviewer who
     * disagrees returns the submission with a reason, and the entity corrects it. The
     * original confirmation and its author remain on the record.
     */
    @PostMapping("/{submissionId}/review")
    @PreAuthorize("hasAnyRole('DSAC_REVIEWER','ADMIN')")
    public ResponseEntity<?> review(@PathVariable UUID submissionId,
                                    @RequestBody ReviewRequest req,
                                    @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(service.review(submissionId, req.approve(), req.returnReason(), who));
    }
}
