package za.gov.dsac.vuka.web;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.CommentService;
import za.gov.dsac.vuka.service.DocumentVersionService;
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
    private final RiskScoreRepository riskScores;
    private final PublicEntityRepository entities;
    private final ReportingPeriodRepository periods;
    private final DocumentVersionService documentVersions;
    private final CommentService commentService;

    public SubmissionController(SubmissionService service, SubmissionRepository submissions,
                                ExtractionResultRepository extractions, TargetRepository targets,
                                ReportingViewService views, TemplateWriter templateWriter,
                                DocumentRecordRepository documents,
                                RiskScoreRepository riskScores, PublicEntityRepository entities,
                                ReportingPeriodRepository periods,
                                DocumentVersionService documentVersions,
                                CommentService commentService) {
        this.service = service;
        this.submissions = submissions;
        this.extractions = extractions;
        this.targets = targets;
        this.views = views;
        this.templateWriter = templateWriter;
        this.documents = documents;
        this.riskScores = riskScores;
        this.entities = entities;
        this.periods = periods;
        this.documentVersions = documentVersions;
        this.commentService = commentService;
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
        return submissions.findWithEntityAndPeriodById(submissionId)
                .filter(s -> who == null || who.canRead(s.getEntity().getId().toString()));
    }

    // ---------- open ----------

    public record OpenRequest(UUID entityId, UUID periodId, String channel) {}

    @PostMapping("/open")
    @PreAuthorize("@can.has('SUBMIT_REPORTING')")
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
    @PreAuthorize("@can.has('SUBMIT_REPORTING')")
    public ResponseEntity<?> upload(@PathVariable("submissionId") UUID submissionId,
                                    @RequestParam("file") MultipartFile file,
                                    @AuthenticationPrincipal VukaPrincipal who) throws Exception {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        // 404, not 403: a refusal confirms the submission exists, which is a disclosure about another entity.
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.notFound().build();

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
    // Reads each extraction's target, which is lazy, and open-in-view is false.
    @Transactional(readOnly = true)
    public ResponseEntity<List<ExtractionView>> extractions(@PathVariable("submissionId") UUID submissionId,
                                                            @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.notFound().build();

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
    @PreAuthorize("@can.has('SUBMIT_REPORTING')")
    public ResponseEntity<?> confirm(@PathVariable("submissionId") UUID submissionId,
                                     @RequestBody ConfirmRequest req,
                                     @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.notFound().build();

        List<SubmissionService.ConfirmedRow> rows = req.rows().stream()
                .map(r -> new SubmissionService.ConfirmedRow(
                        r.targetId(), r.actualValue(), r.spendToDate(), r.varianceExplanation()))
                .toList();

        int written = service.confirm(submissionId, rows, who);
        return ResponseEntity.ok(Map.of("confirmed", written, "by", who.name()));
    }

    // ---------- submit ----------

    @PostMapping("/{submissionId}/submit")
    @PreAuthorize("@can.has('SUBMIT_REPORTING')")
    public ResponseEntity<?> submit(@PathVariable("submissionId") UUID submissionId,
                                    @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.notFound().build();
        // Not the entity itself: its lazy entity and period proxies cannot be serialised once the
        // service transaction has closed, which answered 500 to a submission that had succeeded.
        Submission done = service.submit(submissionId, who);
        return ResponseEntity.ok(Map.of("submissionId", done.getId(), "status", done.getStatus().name()));
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
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public List<ReportingViewService.SubmissionRow> list(
            @RequestParam(name = "entityId", required = false) UUID entityId,
            @RequestParam(name = "periodId", required = false) UUID periodId,
            @RequestParam(name = "status", required = false) String status,
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
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<ReportingViewService.SubmissionDetail> detail(
            @PathVariable("submissionId") UUID submissionId, @AuthenticationPrincipal VukaPrincipal who) {

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
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<List<ReportingViewService.IndicatorRowView>> rows(
            @PathVariable("submissionId") UUID submissionId, @AuthenticationPrincipal VukaPrincipal who) {

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
    @PreAuthorize("@can.has('DOWNLOAD_TEMPLATE')")
    public ResponseEntity<?> template(@RequestParam("entityId") UUID entityId, @RequestParam("periodId") UUID periodId,
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
    @PreAuthorize("@can.has('SUBMIT_REPORTING')")
    public ResponseEntity<?> attachEvidence(@PathVariable("submissionId") UUID submissionId,
                                            @RequestParam("file") MultipartFile file,
                                            @RequestParam("targetId") UUID targetId,
                                            @RequestParam(name = "agsaCriteria", required = false) List<String> agsaCriteria,
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

        // Through the document write path rather than built here. That path stores the bytes,
        // versions a re-upload instead of adding an unrelated row beside it, and issues a receipt.
        // The per criterion shape is kept: the criterion is part of the document key, so each
        // claim about the file has its own version chain and the bytes are stored once.
        byte[] content = file.getBytes();
        UUID firstId = null;

        // At least one row, even with no criterion recorded. The interface then reads the figure as
        // attached but not traceable, which is a real and different state from unverifiable.
        int rowsToWrite = Math.max(1, criteria.size());
        for (int i = 0; i < rowsToWrite; i++) {
            DocumentRecord doc = documentVersions.store(DocumentVersionService.Incoming.evidence(
                    s.getEntity().getId(), target.getId(), file.getOriginalFilename(),
                    file.getContentType(), content, who, s.getId(),
                    i < criteria.size() ? criteria.get(i) : null)).record();
            if (firstId == null) firstId = doc.getId();
        }

        return ResponseEntity.ok(Map.of(
                "documentId", firstId,
                "agsaCriteria", criteria.stream().map(Enum::name).toList()));
    }

    // ---------- comments, the per target dispute trail ----------

    /**
     * UC-14, and the mechanism behind UC-12.
     *
     * <p>A thread per entity, with each comment anchored on the target it is about. That anchor is
     * the whole point: a note against a specific indicator tells the entity exactly which figure
     * is disputed, where a single free text box for the whole submission makes them guess, correct
     * the wrong number, and lose another two weeks.
     *
     * <p>This is also what the office surface polls, every five seconds, so that a dispute written
     * by a reviewer appears on the reporter's open screen without a reload. It carries the same
     * validator as {@code /api/comments}: the list is every comment for the entity, so the entity
     * digest is exactly what describes it, and an unchanged poll is a 304 with no body.
     */
    @GetMapping("/{submissionId}/comments")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<List<ReportingViewService.CommentView>> listComments(
            @PathVariable("submissionId") UUID submissionId,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            @AuthenticationPrincipal VukaPrincipal who) {

        Submission s = readable(submissionId, who).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();

        String etag = commentService.digest(s.getEntity().getId()).etag();
        var noStore = org.springframework.http.CacheControl.noStore().mustRevalidate();
        if (CommentController.matches(ifNoneMatch, etag)) {
            return ResponseEntity.status(304).eTag(etag).cacheControl(noStore).build();
        }
        return ResponseEntity.ok().eTag(etag).cacheControl(noStore).body(views.commentsFor(s));
    }

    /**
     * @param targetId the figure being disputed or discussed. Required: see {@link #addComment}
     * @param parentId the comment being answered, or null to open a thread
     */
    public record CommentRequest(String body, UUID targetId, UUID parentId) {}

    /**
     * Writes through {@link CommentService}, which is the one write path for comments.
     *
     * <p>This endpoint used to build the row itself, and in doing so it took the target id from
     * the request without checking that the target belonged to the submission's entity, and filed
     * a comment with no target against the submission id under the DOCUMENT anchor type, where no
     * document with that id exists. A comment now has to name the figure it is about, and that
     * figure has to be one of this entity's. Every screen that posts here already sends one.
     */
    @PostMapping("/{submissionId}/comments")
    @PreAuthorize("@can.has('PARTICIPATE')")
    public ResponseEntity<?> addComment(@PathVariable("submissionId") UUID submissionId,
                                        @RequestBody CommentRequest req,
                                        @AuthenticationPrincipal VukaPrincipal who) {

        Submission s = readable(submissionId, who).orElse(null);
        if (s == null || who == null) return ResponseEntity.notFound().build();
        if (req.targetId() == null) {
            return ResponseEntity.badRequest().body(Map.of("error",
                    "Say which figure this is about. A comment on the whole filing tells the entity nothing it can correct."));
        }

        UUID entityId = s.getEntity().getId();
        CommentService.Anchor anchor = commentService.anchor(Enums.AnchorType.TARGET, req.targetId())
                .filter(a -> a.entityId().equals(entityId))
                .orElse(null);
        if (anchor == null) return ResponseEntity.notFound().build();

        Comment c;
        try {
            c = commentService.post(anchor, req.parentId(), req.body(), who);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        return ResponseEntity.ok(new ReportingViewService.CommentView(
                c.getId(), c.getBody(), c.getAuthorName(),
                c.getAuthorRole() == null ? null : c.getAuthorRole().name(),
                c.getCreatedAt().toString(), c.getAnchorType().name(), c.getAnchorId(), null,
                c.getParentId(), c.isResolved()));
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
    @PreAuthorize("@can.has('REVIEW_SUBMISSIONS')")
    public ResponseEntity<?> review(@PathVariable("submissionId") UUID submissionId,
                                    @RequestBody ReviewRequest req,
                                    @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        Submission done = service.review(submissionId, req.approve(), req.returnReason(), who);
        return ResponseEntity.ok(Map.of("submissionId", done.getId(), "status", done.getStatus().name()));
    }
}
