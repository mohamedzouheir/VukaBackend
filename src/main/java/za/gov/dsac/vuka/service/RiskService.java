package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Assembles the facts the {@link RiskEngine} needs, runs it, and persists the result
 * with its signals.
 *
 * All the database work lives here so that the scoring itself stays pure and testable.
 */
@Service
public class RiskService {

    private final PublicEntityRepository entities;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final SubmissionRepository submissions;
    private final AllocationRepository allocations;
    private final AuditFindingRepository findings;
    private final AuditOutcomeRecordRepository outcomes;
    private final RiskScoreRepository scores;
    private final ReportingPeriodRepository periods;

    public RiskService(PublicEntityRepository entities, TargetRepository targets,
                       TargetResultRepository results, SubmissionRepository submissions,
                       AllocationRepository allocations, AuditFindingRepository findings,
                       AuditOutcomeRecordRepository outcomes,
                       RiskScoreRepository scores, ReportingPeriodRepository periods) {
        this.entities = entities;
        this.targets = targets;
        this.results = results;
        this.submissions = submissions;
        this.allocations = allocations;
        this.findings = findings;
        this.outcomes = outcomes;
        this.scores = scores;
        this.periods = periods;
    }

    /** Recomputes and stores the score for one entity in one period. */
    @Transactional
    public RiskScore computeAndStore(UUID entityId, UUID periodId) {
        PublicEntity entity = entities.findById(entityId).orElseThrow();
        ReportingPeriod period = periods.findById(periodId).orElseThrow();
        UUID fyId = period.getFinancialYear().getId();

        RiskEngine.Inputs inputs = gatherInputs(entity, period, fyId);
        RiskEngine.Result result = RiskEngine.score(inputs);

        RiskScore existing = scores.findByEntityIdAndReportingPeriodId(entityId, periodId).orElse(null);
        BigDecimal previous = existing == null ? null : existing.getScore();

        RiskScore score = existing == null ? new RiskScore() : existing;
        score.setEntity(entity);
        score.setReportingPeriod(period);
        score.setScore(result.score());
        score.setBand(result.band());
        score.setPreviousScore(previous);
        score.setComputedAt(Instant.now());

        score.getSignals().clear();
        for (RiskEngine.Signal s : result.signals()) {
            RiskSignal signal = new RiskSignal();
            signal.setType(s.type());
            signal.setValue(s.value());
            signal.setNormalised(s.normalised());
            signal.setWeight(s.weight());
            signal.setContribution(s.contribution());
            signal.setDescription(s.description());
            score.addSignal(signal);
        }

        return scores.save(score);
    }

    /**
     * Turns the database into the ten numbers the engine needs.
     *
     * Everything here is an observable fact from submitted data. Nothing is inferred,
     * which is what lets a reviewer check any signal by hand against the source.
     */
    private RiskEngine.Inputs gatherInputs(PublicEntity entity, ReportingPeriod period, UUID fyId) {
        UUID entityId = entity.getId();

        // --- lateness across prior submissions ---
        List<Submission> prior = submissions.findByEntityIdOrderByCreatedAtDesc(entityId).stream()
                .filter(s -> s.getSubmittedAt() != null && s.getReportingPeriod() != null)
                .filter(s -> s.getReportingPeriod().getSubmissionDueDate() != null)
                .toList();

        // Administrative lateness is the mean across quarterly periods, measured against a date
        // the department set. Statutory lateness is the worst single breach of a PFMA date, and
        // it is a maximum rather than a mean because one breach of the Act is already the
        // finding and averaging it away would be dishonest.
        long totalDaysLate = 0;
        int observed = 0;
        int worstStatutoryLate = 0;

        for (Submission s : prior) {
            ReportingPeriod rp = s.getReportingPeriod();
            LocalDate actual = s.getSubmittedAt().atZone(java.time.ZoneId.of("Africa/Johannesburg")).toLocalDate();

            if (rp.isStatutory() && rp.getRegulatoryDeadline() != null) {
                long late = ChronoUnit.DAYS.between(rp.getRegulatoryDeadline(), actual);
                worstStatutoryLate = Math.max(worstStatutoryLate, (int) Math.max(0, late));
            } else {
                long late = ChronoUnit.DAYS.between(rp.getSubmissionDueDate(), actual);
                totalDaysLate += Math.max(0, late);
                observed++;
            }
        }
        BigDecimal avgLate = observed == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(totalDaysLate).divide(BigDecimal.valueOf(observed), 4, RoundingMode.HALF_UP);

        // --- evidence gap ---
        List<Target> yearTargets = targets.findByEntityIdAndFinancialYearId(entityId, fyId);
        int targetsTotal = yearTargets.size();
        int withNoResult = 0;
        BigDecimal deliveredSum = BigDecimal.ZERO;
        BigDecimal annualSum = BigDecimal.ZERO;
        BigDecimal spendSum = BigDecimal.ZERO;

        for (Target t : yearTargets) {
            List<TargetResult> trs = results.findByTargetId(t.getId());
            if (trs.isEmpty()) {
                withNoResult++;
            } else {
                for (TargetResult tr : trs) {
                    if (tr.getActualValue() != null) deliveredSum = deliveredSum.add(tr.getActualValue());
                    if (tr.getSpendToDate() != null) spendSum = spendSum.add(tr.getSpendToDate());
                }
            }
            if (t.getAnnualTarget() != null) annualSum = annualSum.add(t.getAnnualTarget());
        }

        // --- how far into the year we are ---
        FinancialYear fy = yearTargets.isEmpty() ? null : yearTargets.get(0).getFinancialYear();
        BigDecimal elapsed = yearElapsedFraction(fy);

        // --- spend against delivery ---
        BigDecimal allocationTotal = allocations.findByEntityIdAndFinancialYearId(entityId, fyId).stream()
                .map(Allocation::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal drawnFraction = allocationTotal.compareTo(BigDecimal.ZERO) > 0
                ? spendSum.divide(allocationTotal, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        BigDecimal deliveryFraction = annualSum.compareTo(BigDecimal.ZERO) > 0
                ? deliveredSum.divide(annualSum, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // --- audit history ---
        //
        // The opinion of record comes from AuditOutcomeRecord, which holds one row per entity per
        // year. The findings count comes from AuditFinding rows, which are findings and nothing
        // else. Keeping them apart is what lets the model distinguish "clean audit, zero findings"
        // from "audit never completed, therefore no findings", which a count on its own gets
        // exactly backwards: an unaudited entity would score as the cleanest in the portfolio.
        List<AuditOutcomeRecord> outcomeHistory =
                outcomes.findByEntityIdOrderByFinancialYearStartDateDesc(entityId);

        boolean auditOutstanding = outcomeHistory.stream()
                .findFirst()
                .map(AuditOutcomeRecord::isOutstanding)
                .orElse(false);

        List<AuditFinding> af = findings.findByEntityId(entityId);
        List<AuditFinding> realFindings = af.stream()
                .filter(f -> f.getOutcome() != Enums.AuditOutcome.OUTSTANDING)
                .toList();
        int findingCount = realFindings.size();
        int repeatCount = (int) realFindings.stream().filter(AuditFinding::isRepeatFinding).count();

        // --- churn ---
        // Counted off the version chain rather than off a mutable counter, so a target that was
        // re-tabled three times cannot present itself as having been stable.
        int revisions = yearTargets.stream()
                .mapToInt(t -> Math.max(t.getRevisionCount(), t.getVersion() - 1))
                .sum();

        return new RiskEngine.Inputs(
                avgLate, observed, worstStatutoryLate, targetsTotal, withNoResult,
                elapsed, drawnFraction, deliveryFraction,
                findingCount, repeatCount, auditOutstanding, revisions);
    }

    /** 0..1 through the financial year, clamped. Defaults to mid-year if dates are missing. */
    private BigDecimal yearElapsedFraction(FinancialYear fy) {
        if (fy == null || fy.getStartDate() == null || fy.getEndDate() == null) {
            return new BigDecimal("0.50");
        }
        LocalDate today = LocalDate.now();
        long total = ChronoUnit.DAYS.between(fy.getStartDate(), fy.getEndDate());
        if (total <= 0) return new BigDecimal("0.50");
        long done = ChronoUnit.DAYS.between(fy.getStartDate(), today);
        double f = Math.max(0.0, Math.min(1.0, (double) done / total));
        return BigDecimal.valueOf(f).setScale(4, RoundingMode.HALF_UP);
    }
}
