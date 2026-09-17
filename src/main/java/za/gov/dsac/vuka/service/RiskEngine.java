package za.gov.dsac.vuka.service;

import za.gov.dsac.vuka.domain.Enums;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Computes an entity's risk of non-performance, and explains itself.
 *
 * <h2>Why this is deterministic and not a model</h2>
 *
 * A trained model would score better on paper and be indefensible in the room. This
 * is a weighted sum of five observable signals, each of which can be checked against
 * the source data by hand. Any score can be reproduced on a whiteboard. That is a
 * requirement, not a limitation: the department has to justify decisions taken on the
 * back of this to entities, to Parliament and to the Auditor-General.
 *
 * <h2>Why this class has no Spring or JPA in it</h2>
 *
 * Deliberately pure. It takes plain numbers and returns plain records, so the scoring
 * can be unit-tested without a database, a container or a context. {@code RiskService}
 * does the persistence mapping. If the arithmetic is ever wrong, the failing test is
 * three lines long.
 *
 * <h2>The five signals</h2>
 *
 * <pre>
 *   Submission lateness          0.30   how late prior submissions were
 *   Evidence gap                 0.25   targets with nothing reported, weighted by year elapsed
 *   Spend to delivery divergence 0.20   money drawn ahead of delivery
 *   Prior audit findings         0.15   count, doubled for repeats, maximum if the audit is outstanding
 *   Revision churn               0.10   targets restated mid-year
 * </pre>
 *
 * <h2>Two kinds of late, and why the difference is in the arithmetic</h2>
 *
 * An earlier version of this class measured lateness against a thirty day deadline for
 * quarterly performance reporting. That deadline does not exist in law. Treasury Regulation
 * 26.1.1 gives thirty days after quarter end and it covers actual and projected revenue and
 * expenditure only. TR 30.2.1 requires quarterly reporting of progress against targets to the
 * executive authority and sets no day count whatsoever. The thirty days everybody quotes for
 * performance comes from a National Treasury guideline, which binds as an instruction rather
 * than as a regulation.
 *
 * The annual dates are different. PFMA s55(1)(c) gives two months from year end for financial
 * statements to reach the auditors, s55(1)(d) five months for the annual report, and s65(2)
 * sets a six month backstop. Those are statutory and missing them has consequences that have
 * already fallen on entities in this portfolio.
 *
 * So the signal takes the worse of two measures. Administrative lateness, against a departmental
 * due date, is capped at {@link #ADMIN_LATENESS_CEILING_NORM} because breaching an instruction
 * is not breaching an Act. Statutory lateness, against a PFMA date, can reach the full signal.
 * An entity that is chronically late on quarterly returns but files its annual statements on
 * time scores below an entity that files quarterly on time and misses the statutory date, and
 * that ordering is correct.
 *
 * Weights sum to 1.0. Each signal is normalised to 0..1, multiplied by its weight and
 * scaled to 100, so the score lands in 0..100 and each contribution is directly
 * comparable against the others.
 *
 * <h2>Tuning</h2>
 *
 * The weights are a starting point. Tune them against real published performance data:
 * if the ranking they produce disagrees with what the annual reports say, the weights
 * are wrong, not the reports.
 */
public final class RiskEngine {

    // ---- weights, summing to 1.0 ----
    public static final BigDecimal W_LATENESS   = new BigDecimal("0.30");
    public static final BigDecimal W_EVIDENCE   = new BigDecimal("0.25");
    public static final BigDecimal W_DIVERGENCE = new BigDecimal("0.20");
    public static final BigDecimal W_AUDIT      = new BigDecimal("0.15");
    public static final BigDecimal W_CHURN      = new BigDecimal("0.10");

    /**
     * A quarterly submission this many days past the departmental due date is as late as the
     * administrative measure goes. Thirty days because that is what National Treasury's
     * guideline asks for, not because any regulation says so.
     */
    private static final BigDecimal ADMIN_LATENESS_CEILING_DAYS = new BigDecimal("30");

    /**
     * Administrative lateness cannot drive this signal past 0.60 of its range. Missing a
     * departmental instruction repeatedly is a real problem and it is not the same problem as
     * breaching the Public Finance Management Act. The cap is what keeps those two apart.
     */
    private static final BigDecimal ADMIN_LATENESS_CEILING_NORM = new BigDecimal("0.60");

    /**
     * Days past a statutory PFMA date at which the lateness signal is at maximum. Sixty days
     * is chosen so that the worst real case in this portfolio, a set of annual financial
     * statements arriving about seventy days after the s55(1)(c) date, sits at the ceiling.
     */
    private static final BigDecimal STATUTORY_LATENESS_CEILING_DAYS = new BigDecimal("60");

    /** This many weighted findings scores the maximum audit signal. */
    private static final BigDecimal AUDIT_CEILING = new BigDecimal("6");

    /** This many revisions scores the maximum churn signal. */
    private static final BigDecimal CHURN_CEILING = new BigDecimal("5");

    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final int SCALE = 4;

    private RiskEngine() {}

    /**
     * The observable facts the engine needs. Assembling this is the caller's job,
     * which keeps the scoring pure and testable with no database.
     *
     * @param administrativeDaysLate  mean days past the departmental due date across prior quarterly periods
     * @param periodsObserved         how many prior periods that average is drawn from; 0 means no history
     * @param statutoryDaysLate       days past the most recent applicable PFMA date; 0 if filed on time
     * @param targetsTotal            registered targets for the year
     * @param targetsWithNoResult     targets with no confirmed result yet
     * @param yearElapsedFraction     0..1, how far through the financial year we are
     * @param allocationDrawnFraction 0..1, share of allocation spent
     * @param deliveryFraction        0..1, share of annual target delivered
     * @param auditFindings           findings in the most recent audited year
     * @param repeatAuditFindings     how many of those repeat a prior year
     * @param auditOutstanding        the audit was not completed and the entity was excluded from portfolio outcomes
     * @param revisionCount           mid-year target restatements this year
     */
    public record Inputs(
            BigDecimal administrativeDaysLate,
            int periodsObserved,
            int statutoryDaysLate,
            int targetsTotal,
            int targetsWithNoResult,
            BigDecimal yearElapsedFraction,
            BigDecimal allocationDrawnFraction,
            BigDecimal deliveryFraction,
            int auditFindings,
            int repeatAuditFindings,
            boolean auditOutstanding,
            int revisionCount
    ) {}

    /**
     * One contributing factor, with its working shown.
     *
     * @param value        raw observation in the signal's own units
     * @param normalised   that value mapped to 0..1 so signals can be summed
     * @param weight       fixed weight from this class
     * @param contribution normalised * weight * 100, what this added to the score
     * @param description  plain language, written to be read on screen by a reviewer
     */
    public record Signal(
            Enums.RiskSignalType type,
            BigDecimal value,
            BigDecimal normalised,
            BigDecimal weight,
            BigDecimal contribution,
            String description
    ) {}

    /** The score and the signals that produced it. Never return one without the other. */
    public record Result(BigDecimal score, Enums.RiskBand band, List<Signal> signals) {}

    public static Result score(Inputs in) {
        List<Signal> signals = new ArrayList<>();

        signals.add(latenessSignal(in));
        signals.add(evidenceGapSignal(in));
        signals.add(divergenceSignal(in));
        signals.add(auditSignal(in));
        signals.add(churnSignal(in));

        BigDecimal total = signals.stream()
                .map(Signal::contribution)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(SCALE, RoundingMode.HALF_UP);

        return new Result(total, band(total), signals);
    }

    // ------------------------------------------------------------------
    // Signals
    // ------------------------------------------------------------------

    /**
     * Lateness, taken as the worse of two measures that are not the same kind of fact.
     *
     * <p>An entity with no quarterly history scores zero on the administrative measure rather
     * than being penalised for being new. A missed statutory date stands on its own and does
     * not need history behind it, because one breach of the Act is already the finding.
     *
     * <p>The raw value reported on the signal is whichever measure won, so a reviewer reading
     * the panel sees the number that actually drove the score.
     */
    private static Signal latenessSignal(Inputs in) {
        BigDecimal adminDays = nz(in.administrativeDaysLate());
        BigDecimal statutoryDays = BigDecimal.valueOf(in.statutoryDaysLate());

        BigDecimal adminNorm = in.periodsObserved() == 0
                ? BigDecimal.ZERO
                : min(ADMIN_LATENESS_CEILING_NORM,
                      clamp01(adminDays.divide(ADMIN_LATENESS_CEILING_DAYS, SCALE, RoundingMode.HALF_UP)));

        BigDecimal statutoryNorm = in.statutoryDaysLate() <= 0
                ? BigDecimal.ZERO
                : clamp01(statutoryDays.divide(STATUTORY_LATENESS_CEILING_DAYS, SCALE, RoundingMode.HALF_UP));

        boolean statutoryDrives = statutoryNorm.compareTo(adminNorm) >= 0
                                  && in.statutoryDaysLate() > 0;

        BigDecimal norm = statutoryNorm.max(adminNorm);
        BigDecimal raw = statutoryDrives ? statutoryDays : adminDays;

        String desc;
        if (statutoryDrives) {
            desc = "Filed " + in.statutoryDaysLate() + " days after a statutory PFMA deadline. "
                   + "This is a breach of the Act, not of a departmental instruction.";
        } else if (in.periodsObserved() == 0) {
            desc = "No prior reporting history to judge against.";
        } else if (adminDays.compareTo(BigDecimal.ZERO) <= 0) {
            desc = "Submitted on time in every prior period.";
        } else {
            desc = "Submitted an average of " + adminDays.setScale(0, RoundingMode.HALF_UP)
                   + " days past the departmental due date across " + in.periodsObserved()
                   + " prior periods. Quarterly performance reporting for a Schedule 3A entity "
                   + "has no deadline in regulation, so this is measured against the "
                   + "department's own instruction.";
        }

        return signal(Enums.RiskSignalType.SUBMISSION_LATENESS, raw, norm, W_LATENESS, desc);
    }

    /**
     * Evidence gap, scaled by how far into the year we are. Forty percent of targets
     * unreported in Q1 is normal; the same figure in Q4 is a problem. Multiplying the
     * gap by elapsed time is what encodes that difference.
     */
    private static Signal evidenceGapSignal(Inputs in) {
        if (in.targetsTotal() == 0) {
            return signal(Enums.RiskSignalType.EVIDENCE_GAP, BigDecimal.ZERO, BigDecimal.ZERO,
                    W_EVIDENCE, "No targets registered for this year.");
        }

        BigDecimal gap = BigDecimal.valueOf(in.targetsWithNoResult())
                .divide(BigDecimal.valueOf(in.targetsTotal()), SCALE, RoundingMode.HALF_UP);

        BigDecimal norm = clamp01(gap.multiply(clamp01(nz(in.yearElapsedFraction()))));

        String desc = String.format(
                "%d of %d targets have no confirmed result, with %.0f%% of the year elapsed.",
                in.targetsWithNoResult(), in.targetsTotal(),
                clamp01(nz(in.yearElapsedFraction())).multiply(HUNDRED).doubleValue());

        return signal(Enums.RiskSignalType.EVIDENCE_GAP, gap, norm, W_EVIDENCE, desc);
    }

    /**
     * Spend running ahead of delivery. Only the positive gap counts: an entity
     * delivering ahead of spend is efficient rather than risky, and scores zero here.
     */
    private static Signal divergenceSignal(Inputs in) {
        BigDecimal drawn = clamp01(nz(in.allocationDrawnFraction()));
        BigDecimal delivered = clamp01(nz(in.deliveryFraction()));
        BigDecimal gap = drawn.subtract(delivered);

        BigDecimal norm = gap.compareTo(BigDecimal.ZERO) <= 0 ? BigDecimal.ZERO : clamp01(gap);

        String desc = gap.compareTo(BigDecimal.ZERO) <= 0
                ? String.format("Delivery (%.0f%%) is keeping pace with spend (%.0f%%).",
                    delivered.multiply(HUNDRED).doubleValue(), drawn.multiply(HUNDRED).doubleValue())
                : String.format("%.0f%% of allocation drawn against %.0f%% of target delivered.",
                    drawn.multiply(HUNDRED).doubleValue(), delivered.multiply(HUNDRED).doubleValue());

        return signal(Enums.RiskSignalType.SPEND_DELIVERY_DIVERGENCE, gap, norm, W_DIVERGENCE, desc);
    }

    /**
     * Audit history. Repeat findings count double: they signal an unfixed control failure.
     *
     * <p>An outstanding audit takes the signal straight to maximum and short circuits the
     * arithmetic. An entity whose audit was never completed has no findings, and a naive count
     * would therefore score it as clean. That is exactly backwards. No opinion at all is the
     * worst position in the portfolio, worse than a disclaimer, because the department has no
     * assurance of any kind and the entity has already been excluded from the consolidated
     * outcomes.
     */
    private static Signal auditSignal(Inputs in) {
        if (in.auditOutstanding()) {
            return signal(Enums.RiskSignalType.PRIOR_AUDIT_FINDING,
                    BigDecimal.ZERO, BigDecimal.ONE, W_AUDIT,
                    "Audit outstanding. The financial statements missed the statutory date, the "
                    + "audit was not completed, and the entity was excluded from the portfolio "
                    + "audit outcomes. There is no assurance of any kind on this entity.");
        }

        int weighted = in.auditFindings() + in.repeatAuditFindings();
        BigDecimal value = BigDecimal.valueOf(weighted);
        BigDecimal norm = clamp01(value.divide(AUDIT_CEILING, SCALE, RoundingMode.HALF_UP));

        String desc;
        if (in.auditFindings() == 0) {
            desc = "No audit findings in the most recent audited year.";
        } else if (in.repeatAuditFindings() > 0) {
            desc = in.auditFindings() + " audit finding(s), of which "
                   + in.repeatAuditFindings() + " repeat from a prior year.";
        } else {
            desc = in.auditFindings() + " audit finding(s), none repeating.";
        }

        return signal(Enums.RiskSignalType.PRIOR_AUDIT_FINDING, value, norm, W_AUDIT, desc);
    }

    /** Churn. Targets restated mid-year make performance unfalsifiable, which is itself a risk. */
    private static Signal churnSignal(Inputs in) {
        BigDecimal value = BigDecimal.valueOf(in.revisionCount());
        BigDecimal norm = clamp01(value.divide(CHURN_CEILING, SCALE, RoundingMode.HALF_UP));

        String desc = in.revisionCount() == 0
                ? "No targets restated mid-year."
                : in.revisionCount() + " target(s) restated mid-year.";

        return signal(Enums.RiskSignalType.REVISION_CHURN, value, norm, W_CHURN, desc);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static Signal signal(Enums.RiskSignalType type, BigDecimal value,
                                 BigDecimal normalised, BigDecimal weight, String description) {
        return new Signal(
                type,
                value.setScale(SCALE, RoundingMode.HALF_UP),
                normalised.setScale(SCALE, RoundingMode.HALF_UP),
                weight,
                normalised.multiply(weight).multiply(HUNDRED).setScale(SCALE, RoundingMode.HALF_UP),
                description);
    }

    /**
     * Band thresholds. Deliberately round numbers: a reviewer asking why an entity is
     * "high" should get "because it scored over 50", not a derivation.
     */
    public static Enums.RiskBand band(BigDecimal score) {
        double s = score.doubleValue();
        if (s >= 70) return Enums.RiskBand.CRITICAL;
        if (s >= 50) return Enums.RiskBand.HIGH;
        if (s >= 25) return Enums.RiskBand.MEDIUM;
        return Enums.RiskBand.LOW;
    }

    private static BigDecimal min(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) <= 0 ? a : b;
    }

    private static BigDecimal clamp01(BigDecimal v) {
        if (v.compareTo(BigDecimal.ZERO) < 0) return BigDecimal.ZERO;
        if (v.compareTo(BigDecimal.ONE) > 0) return BigDecimal.ONE;
        return v;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
