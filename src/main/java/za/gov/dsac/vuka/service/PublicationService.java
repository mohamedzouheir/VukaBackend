package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Builds the citizen-facing view of an entity.
 *
 * <h2>Publication is a departmental decision, not a product one</h2>
 *
 * Nothing reaches the public surface unless DSAC has set {@code publiclyVisible} on the
 * entity. Whether and when to publish performance information belongs to the department
 * and ultimately to the Minister. The system makes publication a switch rather than a
 * project; it does not make the decision.
 *
 * <h2>What is deliberately absent</h2>
 *
 * No risk scores, no unconfirmed figures, no contact details, no workforce demographics,
 * no comments. The projection carries what a citizen needs to see where the money went
 * and nothing that would embarrass an entity before its reviewer has read the submission.
 *
 * <p>The one thing it carries that is not a figure is the entity's own website. That is not a
 * contact detail: it is already published by the body itself, and it is the answer to the
 * question this page always leaves a reader with.
 *
 * <h2>Only what the Department has approved</h2>
 *
 * A target result counts here only once the submission it came in has been approved. A result
 * filed but not yet reviewed is an unconfirmed figure, and publishing it would put the entity's
 * own claim under the Department's masthead before anyone at the Department has read it.
 *
 * <h2>The Auditor-General's opinions</h2>
 *
 * The one record carried that the entity did not report itself. Audit outcomes are published by
 * the Auditor-General in each entity's annual report, so carrying them here discloses nothing,
 * and each one names the report it was taken from. What is not carried is what Vuka derives from
 * them: the risk band, its signals and its score stay on the Department's side.
 */
@Service
public class PublicationService {

    private final PublicEntityRepository entities;
    private final AllocationRepository allocations;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final SubmissionRepository submissions;
    private final FinancialYearRepository years;
    private final AuditOutcomeRecordRepository audits;

    public PublicationService(PublicEntityRepository entities, AllocationRepository allocations,
                              TargetRepository targets, TargetResultRepository results,
                              SubmissionRepository submissions, FinancialYearRepository years,
                              AuditOutcomeRecordRepository audits) {
        this.entities = entities;
        this.allocations = allocations;
        this.targets = targets;
        this.results = results;
        this.submissions = submissions;
        this.years = years;
        this.audits = audits;
    }

    /** What the citizen page renders. Plain figures, plain language, nothing derived. */
    public record CitizenView(
            UUID entityId,
            String name,
            String sector,
            String mandate,
            /**
             * The entity's own public website, or null.
             *
             * <p>The only field on this projection that is not a figure, and the only one that
             * points off this system. It is here because the page answers one question well and
             * raises three it cannot: a reader who has seen what the museum was given and what it
             * reported will want to know what is on, and sending them to a search engine to find
             * out is how a public record stops being read.
             */
            String website,
            String financialYearLabel,
            BigDecimal totalAllocation,
            int targetsCommitted,
            int targetsAchieved,
            int targetsInProgress,
            int targetsMissed,
            int targetsNotStarted,
            Instant lastReportedAt,
            /** The quarter the last approved report covered, for example Q2 2026/27, or null. */
            String lastReportedPeriod,
            /** Where the allocation comes from, or null where there is none. */
            String allocationSource,
            /** Where the targets come from, or null where there are none. */
            String targetsSource,
            /*
             * The four below are carried on the single entity record only, and are null in the
             * list, so the index does not download every entity's indicator table to draw cards.
             */
            List<String> programmes,
            List<PublicTarget> targets,
            Integer targetsReported,
            List<PublicAudit> audits
    ) {}

    /**
     * One committed target and what has been reported against it, from approved submissions only.
     *
     * @param reported the approved quarterly results added up, or the latest one for a rate; null
     *                 where nothing has been approved, which is not the same as zero
     * @param status   the status of the latest approved result, or null where there is none
     */
    public record PublicTarget(String indicatorRef, String indicator, String unitOfMeasure,
                               BigDecimal annualTarget, BigDecimal reported, Enums.TargetStatus status) {}

    /** One year's audit opinion as the Auditor-General published it, and where it was published. */
    public record PublicAudit(String financialYear, Enums.AuditOutcome outcome, String source) {}

    /** Every entity DSAC has approved for publication. */
    @Transactional(readOnly = true)
    public List<CitizenView> publishedEntities() {
        return entities.findByPubliclyVisibleTrue().stream().map(e -> build(e, false)).toList();
    }

    /**
     * One entity's citizen view.
     *
     * @return null when the entity exists but has not been approved for publication.
     *         The controller turns that into a 404 rather than a "not published" page,
     *         so the public surface never confirms the existence of unpublished data.
     */
    @Transactional(readOnly = true)
    public CitizenView findPublished(UUID entityId) {
        PublicEntity e = entities.findById(entityId).orElse(null);
        if (e == null || !e.isPubliclyVisible()) return null;
        return build(e, true);
    }

    private CitizenView build(PublicEntity e, boolean detailed) {
        Submission last = submissions.findByEntityIdOrderByCreatedAtDesc(e.getId()).stream()
                .filter(s -> s.getStatus() == Enums.SubmissionStatus.APPROVED)
                .filter(s -> s.getSubmittedAt() != null)
                .findFirst().orElse(null);
        Instant lastReported = last == null ? null : last.getSubmittedAt();
        String lastPeriod = last == null || last.getReportingPeriod() == null
                ? null : last.getReportingPeriod().getLabel();
        List<PublicAudit> history = detailed ? auditHistory(e) : null;

        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) {
            return new CitizenView(e.getId(), e.getName(), pretty(e.getSector()), e.getMandate(),
                    e.getWebsite(), "No current financial year", BigDecimal.ZERO, 0, 0, 0, 0, 0,
                    lastReported, lastPeriod, null, null,
                    detailed ? List.of() : null, detailed ? List.of() : null, detailed ? 0 : null, history);
        }

        List<Allocation> rows = allocations.findByEntityIdAndFinancialYearId(e.getId(), fy.getId());
        BigDecimal total = rows.stream()
                .map(Allocation::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Target> ts = targets.findByEntityIdAndFinancialYearId(e.getId(), fy.getId());

        int achieved = 0, inProgress = 0, missed = 0, notStarted = 0, reportedCount = 0;
        List<PublicTarget> table = new ArrayList<>();
        for (Target t : ts) {
            List<TargetResult> approved = results.findByTargetId(t.getId()).stream()
                    .filter(r -> r.getSubmission() != null
                            && r.getSubmission().getStatus() == Enums.SubmissionStatus.APPROVED)
                    .toList();
            Enums.TargetStatus latest = approved.isEmpty() ? null : approved.get(approved.size() - 1).getStatus();
            if (latest == null) notStarted++;
            else switch (latest) {
                case ACHIEVED -> achieved++;
                case IN_PROGRESS -> inProgress++;
                case MISSED -> missed++;
                case NOT_STARTED -> notStarted++;
            }
            BigDecimal reported = reportedToDate(t, approved);
            if (reported != null) reportedCount++;
            if (detailed) {
                table.add(new PublicTarget(t.getIndicatorRef(), t.getIndicator(), t.getUnitOfMeasure(),
                        t.getAnnualTarget(), reported, latest));
            }
        }

        // The same citations the Department's own drilldown gives for the same two figures.
        String allocationSource = rows.isEmpty() ? null
                : "Estimates of National Expenditure 2026, Vote 37, Table 37.3, " + fy.getLabel();
        String targetsSource = ts.isEmpty() ? null
                : "Annual Performance Plan " + fy.getLabel() + ", as tabled";
        List<String> programmes = detailed
                ? rows.stream().map(Allocation::getProgramme).filter(Objects::nonNull).distinct().toList()
                : null;

        return new CitizenView(e.getId(), e.getName(), pretty(e.getSector()), e.getMandate(),
                e.getWebsite(), fy.getLabel(), total, ts.size(), achieved, inProgress, missed,
                notStarted, lastReported, lastPeriod, allocationSource, targetsSource,
                programmes, detailed ? table : null, detailed ? reportedCount : null, history);
    }

    /**
     * What has been delivered against a target so far. Quarterly results for a count add up to
     * the year's figure, the way the risk engine reads them; a rate or a percentage does not, so
     * for those the latest approved figure is the figure.
     */
    private static BigDecimal reportedToDate(Target t, List<TargetResult> approved) {
        List<BigDecimal> values = approved.stream().map(TargetResult::getActualValue).filter(Objects::nonNull).toList();
        if (values.isEmpty()) return null;
        String unit = t.getUnitOfMeasure() == null ? "" : t.getUnitOfMeasure().toLowerCase(Locale.ROOT);
        if (unit.contains("%") || unit.contains("percent") || unit.contains("rate")) {
            return values.get(values.size() - 1);
        }
        return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Every audit opinion on record, newest first, with the report each was taken from. */
    private List<PublicAudit> auditHistory(PublicEntity e) {
        return audits.findByEntityIdOrderByFinancialYearStartDateDesc(e.getId()).stream()
                .filter(a -> a.getOutcome() != null && a.getFinancialYear() != null)
                .map(a -> new PublicAudit(a.getFinancialYear().getLabel(), a.getOutcome(), a.getSourceReference()))
                .toList();
    }

    private String pretty(Enums.Sector s) {
        if (s == null) return "";
        String lower = s.name().toLowerCase().replace('_', ' ');
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
