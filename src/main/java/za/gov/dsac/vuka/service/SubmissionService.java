package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * The submission lifecycle, and the one place the human-in-the-loop rule is enforced.
 *
 * <pre>
 *   upload   parse the template into ExtractionResult rows, each with its source cell
 *   confirm  a named human turns extractions into TargetResult rows
 *   submit   the entity hands the period to DSAC
 *   review   DSAC approves, or returns it with a reason
 * </pre>
 *
 * There is deliberately no method here that edits a confirmed {@link TargetResult}.
 * A reviewer who disputes a figure returns the submission; the entity corrects and
 * confirms again. The original row and the person who confirmed it stay on the record.
 */
@Service
public class SubmissionService {

    private final TemplateParser parser;
    private final UnitCostService unitCost;
    private final SubmissionRepository submissions;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final ExtractionResultRepository extractions;
    private final DocumentVersionService documentVersions;
    private final PublicEntityRepository entities;
    private final ReportingPeriodRepository periods;
    private final CommentRepository comments;

    public SubmissionService(TemplateParser parser, UnitCostService unitCost,
                             SubmissionRepository submissions, TargetRepository targets,
                             TargetResultRepository results, ExtractionResultRepository extractions,
                             DocumentVersionService documentVersions, PublicEntityRepository entities,
                             ReportingPeriodRepository periods, CommentRepository comments) {
        this.comments = comments;
        this.parser = parser;
        this.unitCost = unitCost;
        this.submissions = submissions;
        this.targets = targets;
        this.results = results;
        this.extractions = extractions;
        this.documentVersions = documentVersions;
        this.entities = entities;
        this.periods = periods;
    }

    /** Opens a draft for a period, or returns the existing one. */
    @Transactional
    public Submission openDraft(UUID entityId, UUID periodId, Enums.SubmissionChannel channel,
                                VukaPrincipal who) {
        return submissions.findByEntityIdAndReportingPeriodId(entityId, periodId)
                .orElseGet(() -> {
                    Submission s = new Submission();
                    s.setEntity(entities.findById(entityId).orElseThrow());
                    s.setReportingPeriod(periods.findById(periodId).orElseThrow());
                    s.setStatus(Enums.SubmissionStatus.DRAFT);
                    s.setChannel(channel);
                    s.setCreatedAt(Instant.now());
                    s.setSubmittedByUid(who.uid());
                    s.setSubmittedByName(who.name());
                    return submissions.save(s);
                });
    }

    /**
     * Parses an uploaded template into unconfirmed extractions.
     *
     * Nothing here touches {@link TargetResult}. Rows that cannot be matched to a
     * registered target are stored with {@code needsManualMatch} set, so the reporter
     * is shown them rather than having them silently disappear.
     */
    @Transactional
    public ParseReport ingestTemplate(UUID submissionId, MultipartFile file, VukaPrincipal who)
            throws Exception {

        Submission submission = submissions.findById(submissionId).orElseThrow();
        writableTargets(submission); // refuses a submitted or approved period
        UUID entityId = submission.getEntity().getId();
        UUID fyId = submission.getReportingPeriod().getFinancialYear().getId();

        // The bytes are read once and handed to the document service, which stores them, opens a
        // version and issues a receipt. This used to build a DocumentRecord by hand with a
        // storage path that pointed at nothing, so the extraction rows cited a source document
        // that could not be opened. There is one write path for documents now, the same way
        // there is one for performance data, and the template arrives on it like everything else.
        byte[] content = file.getBytes();
        DocumentRecord doc = documentVersions.store(DocumentVersionService.Incoming.upload(
                entityId,
                Enums.DocumentType.REPORTING_TEMPLATE,
                file.getOriginalFilename(),
                file.getContentType(),
                content,
                who,
                submissionId,
                null)).record();

        TemplateParser.ParseOutcome outcome = parser.parse(new ByteArrayInputStream(content));

        int matched = 0;
        int unmatched = 0;

        for (TemplateParser.ParsedRow row : outcome.rows()) {
            Target target = targets
                    .findByEntityIdAndFinancialYearIdAndIndicatorRef(entityId, fyId, row.indicatorRef())
                    .orElse(null);

            if (target == null) unmatched++; else matched++;

            for (TemplateParser.ParsedCell cell : row.cells()) {
                ExtractionResult ex = new ExtractionResult();
                ex.setSubmission(submission);
                ex.setDocumentRecord(doc);
                ex.setTarget(target);
                ex.setIndicatorRef(row.indicatorRef());
                ex.setFieldName(cell.fieldName());
                ex.setExtractedValue(cell.value());
                ex.setSourceLocation(cell.sourceLocation());
                ex.setConfidence(cell.confidence());
                ex.setConfirmed(false);
                ex.setNeedsManualMatch(target == null);
                extractions.save(ex);
            }
        }

        return new ParseReport(doc.getId(), outcome.rows().size(), matched, unmatched, outcome.warnings());
    }

    public record ParseReport(UUID documentId, int rowsRead, int matched, int unmatched,
                              List<String> warnings) {}

    /**
     * Turns confirmed extractions into performance data.
     *
     * The caller must be a real signed-in person: {@code who.uid()} is written onto every
     * row and is what the audit trail points at. A service account cannot reach this path.
     */
    @Transactional
    public int confirm(UUID submissionId, List<ConfirmedRow> rows, VukaPrincipal who) {
        Submission submission = submissions.findById(submissionId).orElseThrow();
        Set<UUID> reopened = writableTargets(submission);
        for (ConfirmedRow row : rows) {
            if (reopened != null && !reopened.contains(row.targetId())) {
                throw new StateException("This figure is not open for correction. Once a period is"
                        + " returned, only the figures the Department disputed can be confirmed again.");
            }
        }
        int written = 0;

        for (ConfirmedRow row : rows) {
            Target target = targets.findById(row.targetId()).orElse(null);
            if (target == null) continue;

            BigDecimal quarterTarget = quarterTargetFor(target, submission.getReportingPeriod().getQuarter());
            requireReasons(target, row, quarterTarget);

            TargetResult tr = new TargetResult();
            tr.setTarget(target);
            tr.setSubmission(submission);
            tr.setIndicatorRef(target.getIndicatorRef());
            tr.setActualValue(row.actualValue());
            tr.setQuarterTarget(quarterTarget);
            tr.setVariance(row.actualValue() == null || quarterTarget == null
                    ? null : row.actualValue().subtract(quarterTarget));
            tr.setVarianceExplanation(row.varianceExplanation());
            tr.setSpendToDate(row.spendToDate());
            tr.setActualUnitCost(unitCost.actualUnitCost(row.spendToDate(), row.actualValue()));
            tr.setStatus(deriveStatus(row.actualValue(), quarterTarget));
            tr.setConfirmedByUid(who.uid());
            tr.setConfirmedByName(who.name());
            tr.setConfirmedAt(Instant.now());
            results.save(tr);
            written++;
        }

        // Only the extractions behind the targets actually confirmed in this call. This used to
        // mark every unconfirmed extraction on the submission, which was survivable while the
        // web confirmation screen was the one caller and sent all its rows at once. The mobile
        // flow confirms one indicator per request, so the old behaviour would have stamped
        // "a human confirmed this" on nineteen figures nobody had looked at yet. That is the
        // exact claim this separation exists to make, so it is enforced per row.
        Set<UUID> confirmedTargets = rows.stream()
                .map(ConfirmedRow::targetId)
                .collect(Collectors.toSet());

        extractions.findBySubmissionIdAndConfirmedFalse(submissionId).stream()
                .filter(e -> e.getTarget() != null && confirmedTargets.contains(e.getTarget().getId()))
                .forEach(e -> { e.setConfirmed(true); extractions.save(e); });

        return written;
    }

    public record ConfirmedRow(UUID targetId, BigDecimal actualValue,
                               BigDecimal spendToDate, String varianceExplanation) {}

    /** Hands the period to DSAC. */
    @Transactional
    public Submission submit(UUID submissionId, VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElseThrow();
        if (s.getStatus() != Enums.SubmissionStatus.DRAFT
                && s.getStatus() != Enums.SubmissionStatus.RETURNED) {
            throw new StateException("This period has already been submitted to the Department.");
        }
        UUID fyId = s.getReportingPeriod().getFinancialYear() == null
                ? null : s.getReportingPeriod().getFinancialYear().getId();
        if (fyId != null) {
            Set<UUID> answered = results.findBySubmissionId(submissionId).stream()
                    .filter(r -> r.getConfirmedAt() != null && r.getTarget() != null)
                    .map(r -> r.getTarget().getId())
                    .collect(Collectors.toSet());
            long missing = targets.findByEntityIdAndFinancialYearId(s.getEntity().getId(), fyId).stream()
                    .filter(t -> !answered.contains(t.getId()))
                    .count();
            if (missing > 0) {
                throw new StateException(missing + (missing == 1 ? " target has" : " targets have")
                        + " no confirmed result or recorded reason yet.");
            }
        }
        s.setStatus(Enums.SubmissionStatus.SUBMITTED);
        s.setSubmittedAt(Instant.now());
        s.setSubmittedByUid(who.uid());
        s.setSubmittedByName(who.name());
        return submissions.save(s);
    }

    /** DSAC approves, or returns with a reason the entity can act on. */
    @Transactional
    public Submission review(UUID submissionId, boolean approve, String returnReason, VukaPrincipal who) {
        Submission s = submissions.findById(submissionId).orElseThrow();
        if (s.getStatus() != Enums.SubmissionStatus.SUBMITTED) {
            throw new StateException(s.getStatus() == Enums.SubmissionStatus.DRAFT
                    ? "The entity has not submitted this period yet, so there is nothing to approve or return."
                    : "This submission has already been " + s.getStatus().name().toLowerCase()
                      + ". It can be reviewed again once the entity resubmits it.");
        }
        s.setStatus(approve ? Enums.SubmissionStatus.APPROVED : Enums.SubmissionStatus.RETURNED);
        s.setReturnReason(approve ? null : returnReason);
        s.setReviewedByUid(who.uid());
        s.setReviewedAt(Instant.now());
        return submissions.save(s);
    }

    // ------------------------------------------------------------------

    /**
     * Which targets may be written to now. Null means any: a draft is still the reporter's.
     *
     * <p>Once submitted or approved nothing may be written, which is what makes "cannot be edited
     * afterwards" true on the server rather than only on the screen. A returned period reopens
     * exactly the figures under an open dispute, plus any target that was never answered.
     */
    public Set<UUID> writableTargets(Submission s) {
        if (s.getStatus() == Enums.SubmissionStatus.DRAFT) return null;
        if (s.getStatus() != Enums.SubmissionStatus.RETURNED) {
            throw new StateException("This period has been submitted, so its figures can no longer be"
                    + " changed. The Department returns it if a figure needs correcting.");
        }
        Set<UUID> open = new HashSet<>();
        for (Comment c : comments.findByEntityIdOrderByCreatedAtDesc(s.getEntity().getId())) {
            if (ReportingViewService.isOpenDispute(c)) open.add(c.getAnchorId());
        }
        Set<UUID> answered = results.findBySubmissionId(s.getId()).stream()
                .filter(r -> r.getConfirmedAt() != null && r.getTarget() != null)
                .map(r -> r.getTarget().getId())
                .collect(Collectors.toSet());
        UUID fyId = s.getReportingPeriod().getFinancialYear() == null
                ? null : s.getReportingPeriod().getFinancialYear().getId();
        if (fyId != null) {
            targets.findByEntityIdAndFinancialYearId(s.getEntity().getId(), fyId).stream()
                    .map(Target::getId)
                    .filter(id -> !answered.contains(id))
                    .forEach(open::add);
        }
        return open;
    }

    /**
     * The two reasons a figure cannot be filed without, on every surface. The office screen checked
     * both before it sent anything, but the phone did not, and a rule that one of two screens
     * enforces is a suggestion. A figure more than twenty percent under its quarter target needs a
     * reason, and so does having no figure at all, which is recorded as an absence and never as 0.
     */
    private static void requireReasons(Target target, ConfirmedRow row, BigDecimal quarterTarget) {
        boolean noReason = row.varianceExplanation() == null || row.varianceExplanation().isBlank();
        if (!noReason) return;
        if (row.actualValue() == null) {
            throw new ReasonRequired(target.getIndicatorRef()
                    + " has no figure. Say why there is no result this quarter.");
        }
        if (quarterTarget != null && quarterTarget.signum() > 0) {
            BigDecimal shortfall = quarterTarget.subtract(row.actualValue())
                    .divide(quarterTarget, 4, RoundingMode.HALF_UP);
            if (shortfall.compareTo(new BigDecimal("0.20")) > 0) {
                throw new ReasonRequired(target.getIndicatorRef() + " is more than 20 percent under its"
                        + " quarter target of " + quarterTarget.stripTrailingZeros().toPlainString()
                        + ". Say why, so the Department does not have to send it back to ask.");
            }
        }
    }

    /** A figure refused for want of a reason. The phone shows it on the same step, beside the field. */
    public static class ReasonRequired extends StateException {
        public ReasonRequired(String message) { super(message); }
    }

    /** An action the submission's current state does not allow. Answered as 409 with the message. */
    public static class StateException extends RuntimeException {
        public StateException(String message) { super(message); }
    }

    private BigDecimal quarterTargetFor(Target t, Integer quarter) {
        if (quarter == null) return t.getAnnualTarget();
        return switch (quarter) {
            case 1 -> t.getQ1Target();
            case 2 -> t.getQ2Target();
            case 3 -> t.getQ3Target();
            case 4 -> t.getQ4Target();
            default -> t.getAnnualTarget();
        };
    }

    /**
     * Status is derived, not typed in, so it cannot disagree with the numbers beside it.
     * A target is only "achieved" at 100 percent or better; anything else in-period is
     * in progress rather than missed, because the quarter is not the deadline.
     */
    private Enums.TargetStatus deriveStatus(BigDecimal actual, BigDecimal target) {
        if (actual == null || actual.compareTo(BigDecimal.ZERO) == 0) return Enums.TargetStatus.NOT_STARTED;
        if (target == null || target.compareTo(BigDecimal.ZERO) == 0) return Enums.TargetStatus.IN_PROGRESS;
        BigDecimal ratio = actual.divide(target, 4, RoundingMode.HALF_UP);
        if (ratio.compareTo(BigDecimal.ONE) >= 0) return Enums.TargetStatus.ACHIEVED;
        if (ratio.compareTo(new BigDecimal("0.5")) >= 0) return Enums.TargetStatus.IN_PROGRESS;
        return Enums.TargetStatus.MISSED;
    }
}
