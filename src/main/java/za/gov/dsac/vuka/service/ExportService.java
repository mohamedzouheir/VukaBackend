package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Turns an approved submission into something the rest of government can consume.
 *
 * <h2>Why this class exists, and why it is not an afterthought</h2>
 *
 * The Department of Planning, Monitoring and Evaluation already runs eQPRS, the Electronic
 * Quarterly Performance Reporting System, at eqprs.dpme.gov.za. It configures indicators and
 * targets, captures actuals against them, carries an approval workflow and draws dashboards.
 * DPME has been onboarding national public entities onto it, and a successor called the
 * Integrated Reporting System is planned.
 *
 * <p>That is most of a capture tool, which means capture is not where this system earns its
 * place. What eQPRS does not do, and what every entity in this portfolio actually fails at, is
 * hold the evidence that makes a reported figure survive an audit of predetermined objectives.
 * So the strategy here is deliberate and worth stating plainly in a pitch: <b>be the evidence
 * and audit readiness layer, and treat reporting as an export.</b> If the Integrated Reporting
 * System lands tomorrow and mandates entity reporting through it, everything in this package
 * still has a job, because what it exports is exactly what that system will want as input.
 *
 * <h2>The three reporting lines, which are not the same line</h2>
 *
 * A Schedule 3A entity has more than one audience and the research is unambiguous that they
 * differ:
 *
 * <ul>
 *   <li><b>Executive authority</b>, under Treasury Regulation 30.2.1, quarterly progress against
 *       the targets in the strategic and annual performance plan. No day count in the regulation
 *       and no prescribed system. This is the gap this product sits in.</li>
 *   <li><b>National Treasury</b>, under Treasury Regulation 26.1.1, actual and projected revenue
 *       and expenditure within 30 days of quarter end. Financial only, and it goes by email to
 *       datafilepe@treasury.gov.za rather than to any portal.</li>
 *   <li><b>eQPRS</b>, where the department chooses to use it, in DPME's own indicator and actual
 *       shape.</li>
 * </ul>
 *
 * Producing one of these from one confirmed dataset is the "report once" requirement. Producing
 * three of them is the argument that the department should not be retyping anything.
 *
 * <h2>What an export never does</h2>
 *
 * It never computes a figure. Every number it emits was confirmed by a named person and is read
 * back unchanged, carrying the cell it was extracted from. An export that recalculates is an
 * export that can disagree with the record, and the whole point of the record is that it cannot
 * be argued with.
 */
@Service
public class ExportService {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;

    /** Bumped whenever the shape below changes, so a consumer can tell which contract it got. */
    public static final String SCHEMA_VERSION = "vuka-quarterly-1.0";

    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final ExtractionResultRepository extractions;
    private final DocumentRecordRepository documents;

    public ExportService(TargetRepository targets, TargetResultRepository results,
                         ExtractionResultRepository extractions, DocumentRecordRepository documents) {
        this.targets = targets;
        this.results = results;
        this.extractions = extractions;
        this.documents = documents;
    }

    // ------------------------------------------------------------------
    // The shape
    // ------------------------------------------------------------------

    /**
     * One indicator, as filed.
     *
     * <p>{@code sourceLocation} is the field that makes this different from every other
     * performance export in government. It names the cell the figure came out of, so a reader
     * can go back to the original workbook and check. The Auditor-General's reliability test is
     * whether reported information can be traced back to source data. This field is that test,
     * expressed as data.
     */
    public record IndicatorLine(
            String indicatorRef,
            String indicator,
            String outputStatement,
            String unitOfMeasure,
            BigDecimal annualTarget,
            BigDecimal quarterTarget,
            BigDecimal actual,
            BigDecimal variance,
            String varianceExplanation,
            String status,
            String sourceLocation,
            int evidenceCount,
            List<String> evidenceCriteria,
            boolean traceable,
            String confirmedByName,
            String confirmedAt,
            int targetVersion,
            String targetRevisionTrigger,
            String targetRetablingReference) {}

    /** The whole filing, with enough provenance on it to be checked by someone who was not there. */
    public record QuarterlyExport(
            String schemaVersion,
            String generatedAt,
            EntityBlock entity,
            PeriodBlock period,
            SubmissionBlock submission,
            List<IndicatorLine> indicators,
            Totals totals,
            List<String> caveats) {}

    public record EntityBlock(UUID id, String name, String shortName, String pfmaSchedule,
                              String sector, String reportingLine) {}

    public record PeriodBlock(String label, int quarter, String financialYear,
                              String periodStart, String periodEnd,
                              String submissionDueDate, String regulatoryDeadline,
                              String deadlineBasis, String deadlineCitation) {}

    public record SubmissionBlock(UUID id, String status, String channel,
                                  String submittedByName, String submittedAt,
                                  Integer daysLate, String reviewedAt) {}

    public record Totals(int indicatorsTotal, int indicatorsReported, int indicatorsAchieved,
                         int indicatorsTraceable, int indicatorsWithoutEvidence,
                         BigDecimal proportionTraceable) {}

    // ------------------------------------------------------------------
    // Building it
    // ------------------------------------------------------------------

    /**
     * Reads a submission back out in export shape.
     *
     * <p>Note the ordering of the joins. We start from the registered targets rather than from
     * the results, so an indicator with nothing reported against it appears in the export as a
     * line with a null actual instead of vanishing. A report that silently omits what was not
     * done is the exact failure this whole system exists to stop.
     */
    // Transactional because the export walks evidence, targets and periods lazily, and outside a
    // session the first of those threw: Export with provenance answered every reviewer with a 500.
    @Transactional(readOnly = true)
    public QuarterlyExport build(Submission submission) {
        PublicEntity entity = submission.getEntity();
        ReportingPeriod period = submission.getReportingPeriod();
        FinancialYear fy = period.getFinancialYear();

        List<Target> registered = targets.findByEntityIdAndFinancialYearId(entity.getId(), fy.getId());

        Map<UUID, TargetResult> resultByTarget = new HashMap<>();
        for (TargetResult r : results.findBySubmissionId(submission.getId())) {
            if (r.getTarget() != null) resultByTarget.put(r.getTarget().getId(), r);
        }

        Map<String, String> cellByIndicator = new HashMap<>();
        for (ExtractionResult x : extractions.findBySubmissionId(submission.getId())) {
            if (x.getIndicatorRef() != null && x.getSourceLocation() != null) {
                cellByIndicator.put(x.getIndicatorRef(), x.getSourceLocation());
            }
        }

        Map<UUID, List<DocumentRecord>> evidenceByTarget = evidenceByTarget(submission);

        List<IndicatorLine> lines = new ArrayList<>();
        int reported = 0, achieved = 0, traceable = 0, withoutEvidence = 0;

        registered.sort(Comparator.comparing(t -> nullSafe(t.getIndicatorRef())));

        for (Target t : registered) {
            TargetResult r = resultByTarget.get(t.getId());
            List<DocumentRecord> evidence = evidenceByTarget.getOrDefault(t.getId(), List.of());

            String cell = cellByIndicator.get(t.getIndicatorRef());
            boolean isTraceable = !evidence.isEmpty() && cell != null;

            if (r != null && r.getActualValue() != null) reported++;
            if (r != null && r.getStatus() == Enums.TargetStatus.ACHIEVED) achieved++;
            if (isTraceable) traceable++;
            if (evidence.isEmpty()) withoutEvidence++;

            lines.add(new IndicatorLine(
                    t.getIndicatorRef(),
                    t.getIndicator(),
                    t.getOutputStatement(),
                    t.getUnitOfMeasure(),
                    t.getAnnualTarget(),
                    quarterTarget(t, period.getQuarter()),
                    r == null ? null : r.getActualValue(),
                    r == null ? null : r.getVariance(),
                    r == null ? null : r.getVarianceExplanation(),
                    r == null || r.getStatus() == null ? "NOT_REPORTED" : r.getStatus().name(),
                    cell,
                    evidence.size(),
                    criteriaOf(evidence),
                    isTraceable,
                    r == null ? null : r.getConfirmedByName(),
                    r == null || r.getConfirmedAt() == null ? null : r.getConfirmedAt().toString(),
                    t.getVersion(),
                    t.getRevisionTrigger() == null ? null : t.getRevisionTrigger().name(),
                    t.getRetablingReference()));
        }

        int total = lines.size();
        BigDecimal proportion = total == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(traceable)
                        .divide(BigDecimal.valueOf(total), 4, RoundingMode.HALF_UP);

        return new QuarterlyExport(
                SCHEMA_VERSION,
                java.time.Instant.now().toString(),
                entityBlock(entity),
                periodBlock(period, fy),
                submissionBlock(submission, period),
                lines,
                new Totals(total, reported, achieved, traceable, withoutEvidence, proportion),
                caveats(withoutEvidence, total, period));
    }

    // ------------------------------------------------------------------
    // Blocks
    // ------------------------------------------------------------------

    private static EntityBlock entityBlock(PublicEntity e) {
        return new EntityBlock(
                e.getId(), e.getName(), e.getShortName(),
                e.getPfmaSchedule() == null ? null : e.getPfmaSchedule().name(),
                e.getSector() == null ? null : e.getSector().name(),
                reportingLine(e.getPfmaSchedule()));
    }

    /**
     * Who this entity owes its quarterly performance report to, and under what.
     *
     * <p>Spelled out on every export because the answer differs by schedule and because the
     * difference is the reason the deadline field can be null without that being a bug.
     */
    private static String reportingLine(Enums.PfmaSchedule schedule) {
        if (schedule == null) return "Not determined.";
        return switch (schedule) {
            case SCHEDULE_3A, SCHEDULE_3C -> "Executive authority, under Treasury Regulation 30.2.1. "
                    + "The regulation prescribes no day count and names no system.";
            case SCHEDULE_3B, SCHEDULE_2 -> "National Treasury non-financial quarterly reporting "
                    + "guideline, which covers Schedule 2 and 3B.";
            case SCHEDULE_1 -> "Constitutional institution. Reports under its own establishing Act "
                    + "and the 2019 Revised Framework, which covers Schedule 1.";
            case SCHEDULE_3D -> "Determined by the entity's establishing legislation.";
        };
    }

    private static PeriodBlock periodBlock(ReportingPeriod p, FinancialYear fy) {
        return new PeriodBlock(
                p.getLabel(), p.getQuarter(), fy == null ? null : fy.getLabel(),
                fmt(p.getPeriodStart()), fmt(p.getPeriodEnd()),
                fmt(p.getSubmissionDueDate()), fmt(p.getRegulatoryDeadline()),
                p.getDeadlineBasis() == null ? null : p.getDeadlineBasis().name(),
                p.getDeadlineCitation());
    }

    private static SubmissionBlock submissionBlock(Submission s, ReportingPeriod p) {
        Integer daysLate = null;
        if (s.getSubmittedAt() != null && p.getSubmissionDueDate() != null) {
            LocalDate submitted = s.getSubmittedAt()
                    .atZone(java.time.ZoneId.of("Africa/Johannesburg")).toLocalDate();
            long d = java.time.temporal.ChronoUnit.DAYS.between(p.getSubmissionDueDate(), submitted);
            daysLate = (int) Math.max(0, d);
        }
        return new SubmissionBlock(
                s.getId(),
                s.getStatus() == null ? null : s.getStatus().name(),
                s.getChannel() == null ? null : s.getChannel().name(),
                s.getSubmittedByName(),
                s.getSubmittedAt() == null ? null : s.getSubmittedAt().toString(),
                daysLate,
                s.getReviewedAt() == null ? null : s.getReviewedAt().toString());
    }

    /**
     * What a reader should not conclude from this file.
     *
     * <p>Every export carries its own limitations. A consumer that strips them is making a
     * choice we cannot stop, but an export that never stated them in the first place is one we
     * would be responsible for.
     */
    private static List<String> caveats(int withoutEvidence, int total, ReportingPeriod p) {
        List<String> out = new ArrayList<>();
        if (withoutEvidence > 0) {
            out.add(withoutEvidence + " of " + total + " indicators carry no evidence. Those "
                    + "figures are unverifiable rather than merely unverified, and should not be "
                    + "relied on for an audit of predetermined objectives.");
        }
        if (p.getRegulatoryDeadline() == null) {
            out.add("This period has no regulatory deadline because none exists in regulation for "
                    + "quarterly performance reporting by this entity. Any lateness shown is "
                    + "measured against a departmental instruction.");
        }
        out.add("Figures are reproduced exactly as confirmed by the named entity official. "
                + "Nothing in this export is recalculated.");
        return out;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private Map<UUID, List<DocumentRecord>> evidenceByTarget(Submission submission) {
        Map<UUID, List<DocumentRecord>> byTarget = new HashMap<>();
        Map<String, UUID> targetIdByIndicator = new HashMap<>();

        for (TargetResult r : results.findBySubmissionId(submission.getId())) {
            if (r.getTarget() != null && r.getIndicatorRef() != null) {
                targetIdByIndicator.put(r.getIndicatorRef(), r.getTarget().getId());
            }
        }
        for (ExtractionResult x : extractions.findBySubmissionId(submission.getId())) {
            if (x.getTarget() == null || x.getDocumentRecord() == null) continue;
            byTarget.computeIfAbsent(x.getTarget().getId(), k -> new ArrayList<>())
                    .add(x.getDocumentRecord());
        }
        for (DocumentRecord d : documents.findBySubmissionId(submission.getId())) {
            if (d.getDocumentType() == Enums.DocumentType.REPORTING_TEMPLATE) continue;
            UUID t = targetIdByIndicator.get(stripIndicator(d.getFileName()));
            if (t != null) byTarget.computeIfAbsent(t, k -> new ArrayList<>()).add(d);
        }
        return byTarget;
    }

    /** Evidence filenames are prefixed with the indicator they support. Best effort, never fatal. */
    private static String stripIndicator(String fileName) {
        if (fileName == null) return "";
        int dash = fileName.indexOf('_');
        return dash > 0 ? fileName.substring(0, dash) : "";
    }

    private static List<String> criteriaOf(List<DocumentRecord> evidence) {
        Set<String> out = new LinkedHashSet<>();
        for (DocumentRecord d : evidence) {
            if (d.getAgsaCriterion() != null) out.add(d.getAgsaCriterion().name());
        }
        return new ArrayList<>(out);
    }

    private static BigDecimal quarterTarget(Target t, Integer quarter) {
        if (quarter == null) return null;
        return switch (quarter) {
            case 1 -> t.getQ1Target();
            case 2 -> t.getQ2Target();
            case 3 -> t.getQ3Target();
            case 4 -> t.getQ4Target();
            default -> null;
        };
    }

    private static String fmt(LocalDate d) { return d == null ? null : d.format(ISO); }

    private static String nullSafe(String s) { return s == null ? "" : s; }

    // ------------------------------------------------------------------
    // eQPRS shape
    // ------------------------------------------------------------------

    /**
     * The same filing, flattened into the columns DPME's quarterly reporting works in.
     *
     * <p>This is deliberately lossy. It drops the source cell, the evidence count and the
     * traceability flag, because eQPRS has nowhere to put them. That loss is the argument:
     * the export goes out, the evidence stays here, and the department keeps a defensible
     * record of why each figure was believed rather than only the figure itself.
     *
     * <p>The column names are our reading of a published reporting shape, not a certified
     * integration. Confirm them against DPME's current template before anyone relies on this.
     */
    public record EqprsLine(String indicatorCode, String indicatorDescription,
                            String annualTarget, String quarterlyTarget, String actualOutput,
                            String deviationReason, String correctiveAction) {}

    public List<EqprsLine> toEqprsShape(QuarterlyExport export) {
        List<EqprsLine> out = new ArrayList<>();
        for (IndicatorLine l : export.indicators()) {
            out.add(new EqprsLine(
                    l.indicatorRef(),
                    l.indicator(),
                    str(l.annualTarget()),
                    str(l.quarterTarget()),
                    l.actual() == null ? "" : str(l.actual()),
                    l.varianceExplanation() == null ? "" : l.varianceExplanation(),
                    ""));
        }
        return out;
    }

    private static String str(BigDecimal b) {
        return b == null ? "" : b.stripTrailingZeros().toPlainString();
    }
}
