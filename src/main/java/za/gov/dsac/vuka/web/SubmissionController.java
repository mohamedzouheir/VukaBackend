package za.gov.dsac.vuka.web;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.SubmissionService;

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

    public SubmissionController(SubmissionService service, SubmissionRepository submissions,
                                ExtractionResultRepository extractions, TargetRepository targets) {
        this.service = service;
        this.submissions = submissions;
        this.extractions = extractions;
        this.targets = targets;
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
    public ResponseEntity<?> upload(@PathVariable("submissionId") UUID submissionId,
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
    public ResponseEntity<List<ExtractionView>> extractions(@PathVariable("submissionId") UUID submissionId,
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
    public ResponseEntity<?> confirm(@PathVariable("submissionId") UUID submissionId,
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
    public ResponseEntity<?> submit(@PathVariable("submissionId") UUID submissionId,
                                    @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        if (!who.canRead(s.getEntity().getId().toString())) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(service.submit(submissionId, who));
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
    public ResponseEntity<?> review(@PathVariable("submissionId") UUID submissionId,
                                    @RequestBody ReviewRequest req,
                                    @AuthenticationPrincipal VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElse(null);
        if (s == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(service.review(submissionId, req.approve(), req.returnReason(), who));
    }
}
