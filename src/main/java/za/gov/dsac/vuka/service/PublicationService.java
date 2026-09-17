package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
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
 */
@Service
public class PublicationService {

    private final PublicEntityRepository entities;
    private final AllocationRepository allocations;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final SubmissionRepository submissions;
    private final FinancialYearRepository years;

    public PublicationService(PublicEntityRepository entities, AllocationRepository allocations,
                              TargetRepository targets, TargetResultRepository results,
                              SubmissionRepository submissions, FinancialYearRepository years) {
        this.entities = entities;
        this.allocations = allocations;
        this.targets = targets;
        this.results = results;
        this.submissions = submissions;
        this.years = years;
    }

    /** What the citizen page renders. Plain figures, plain language, nothing derived. */
    public record CitizenView(
            UUID entityId,
            String name,
            String sector,
            String mandate,
            String financialYearLabel,
            BigDecimal totalAllocation,
            int targetsCommitted,
            int targetsAchieved,
            int targetsInProgress,
            int targetsMissed,
            int targetsNotStarted,
            Instant lastReportedAt
    ) {}

    /** Every entity DSAC has approved for publication. */
    @Transactional(readOnly = true)
    public List<CitizenView> publishedEntities() {
        return entities.findByPubliclyVisibleTrue().stream().map(this::build).toList();
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
        return build(e);
    }

    private CitizenView build(PublicEntity e) {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) {
            return new CitizenView(e.getId(), e.getName(), pretty(e.getSector()), e.getMandate(),
                    "No current financial year", BigDecimal.ZERO, 0, 0, 0, 0, 0, null);
        }

        BigDecimal total = allocations.findByEntityIdAndFinancialYearId(e.getId(), fy.getId()).stream()
                .map(Allocation::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Target> ts = targets.findByEntityIdAndFinancialYearId(e.getId(), fy.getId());

        int achieved = 0, inProgress = 0, missed = 0, notStarted = 0;
        for (Target t : ts) {
            List<TargetResult> trs = results.findByTargetId(t.getId());
            if (trs.isEmpty()) { notStarted++; continue; }
            Enums.TargetStatus latest = trs.get(trs.size() - 1).getStatus();
            if (latest == null) { notStarted++; continue; }
            switch (latest) {
                case ACHIEVED -> achieved++;
                case IN_PROGRESS -> inProgress++;
                case MISSED -> missed++;
                case NOT_STARTED -> notStarted++;
            }
        }

        Instant lastReported = submissions.findByEntityIdOrderByCreatedAtDesc(e.getId()).stream()
                .filter(s -> s.getStatus() == Enums.SubmissionStatus.APPROVED)
                .map(Submission::getSubmittedAt)
                .filter(i -> i != null)
                .findFirst().orElse(null);

        return new CitizenView(e.getId(), e.getName(), pretty(e.getSector()), e.getMandate(),
                fy.getLabel(), total, ts.size(), achieved, inProgress, missed, notStarted, lastReported);
    }

    private String pretty(Enums.Sector s) {
        if (s == null) return "";
        String lower = s.name().toLowerCase().replace('_', ' ');
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
