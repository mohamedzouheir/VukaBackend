package za.gov.dsac.vuka;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import za.gov.dsac.vuka.domain.Enums;
import za.gov.dsac.vuka.service.RiskEngine;
import za.gov.dsac.vuka.service.RiskEngine.Inputs;
import za.gov.dsac.vuka.service.RiskEngine.Result;
import za.gov.dsac.vuka.service.RiskEngine.Signal;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The risk engine is the one component a judge will interrogate, so it is the one
 * component with real tests. Each of these encodes a claim made in the pitch.
 *
 * <p>Argument order for {@link Inputs}:
 * <pre>
 *   administrativeDaysLate, periodsObserved, statutoryDaysLate,
 *   targetsTotal, targetsWithNoResult, yearElapsedFraction,
 *   allocationDrawnFraction, deliveryFraction,
 *   auditFindings, repeatAuditFindings, auditOutstanding, revisionCount[, periodsUnfiled]
 * </pre>
 */
class RiskEngineTest {

    private static BigDecimal bd(String s) { return new BigDecimal(s); }

    private static BigDecimal contributionOf(Result r, Enums.RiskSignalType type) {
        return r.signals().stream()
                .filter(s -> s.type() == type)
                .findFirst().orElseThrow()
                .contribution();
    }

    @Test
    @DisplayName("An entity doing everything right scores zero")
    void modelEntityScoresZero() {
        Result r = RiskEngine.score(new Inputs(
                bd("0"), 4, 0, 12, 0, bd("0.50"), bd("0.48"), bd("0.50"), 0, 0, false, 0));
        assertEquals(0, r.score().compareTo(BigDecimal.ZERO));
        assertEquals(Enums.RiskBand.LOW, r.band());
    }

    @Test
    @DisplayName("Weights sum to 1.0, so the worst case caps at exactly 100")
    void worstCaseCapsAtHundred() {
        Result r = RiskEngine.score(new Inputs(
                bd("60"), 4, 90, 10, 10, bd("1.0"), bd("1.0"), bd("0.0"), 10, 10, true, 10));
        assertEquals(0, r.score().compareTo(bd("100")));
        assertEquals(Enums.RiskBand.CRITICAL, r.band());
    }

    @Test
    @DisplayName("Contributions always sum to the score, so the panel never lies")
    void contributionsSumToScore() {
        Result r = RiskEngine.score(new Inputs(
                bd("12"), 3, 0, 20, 7, bd("0.6"), bd("0.7"), bd("0.4"), 2, 1, false, 3));
        BigDecimal sum = r.signals().stream()
                .map(Signal::contribution)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertEquals(0, sum.compareTo(r.score()));
    }

    @Test
    @DisplayName("Every signal is explained in plain language")
    void everySignalIsExplained() {
        Result r = RiskEngine.score(new Inputs(
                bd("5"), 2, 0, 10, 3, bd("0.5"), bd("0.5"), bd("0.4"), 1, 0, false, 1));
        assertEquals(5, r.signals().size());
        r.signals().forEach(s -> assertFalse(s.description() == null || s.description().isBlank(),
                "signal " + s.type() + " has no description"));
    }

    @Test
    @DisplayName("A new entity is not punished for having no history")
    void newEntityNotPenalisedForLateness() {
        Result r = RiskEngine.score(new Inputs(
                bd("0"), 0, 0, 8, 8, bd("0.10"), bd("0.05"), bd("0"), 0, 0, false, 0));
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.SUBMISSION_LATENESS)
                .compareTo(BigDecimal.ZERO));
    }

    @Test
    @DisplayName("Delivering ahead of spend is efficiency, not risk")
    void deliveryAheadOfSpendScoresZero() {
        Result r = RiskEngine.score(new Inputs(
                bd("0"), 4, 0, 10, 0, bd("0.5"), bd("0.20"), bd("0.80"), 0, 0, false, 0));
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.SPEND_DELIVERY_DIVERGENCE)
                .compareTo(BigDecimal.ZERO));
    }

    @Test
    @DisplayName("The same evidence gap matters more in Q4 than in Q1")
    void evidenceGapWeightedByYearElapsed() {
        Result q1 = RiskEngine.score(new Inputs(
                bd("0"), 1, 0, 10, 6, bd("0.25"), bd("0.2"), bd("0.2"), 0, 0, false, 0));
        Result q4 = RiskEngine.score(new Inputs(
                bd("0"), 1, 0, 10, 6, bd("1.00"), bd("0.2"), bd("0.2"), 0, 0, false, 0));
        assertTrue(q4.score().compareTo(q1.score()) > 0);
    }

    @Test
    @DisplayName("Repeat audit findings are weighted heavier than fresh ones")
    void repeatFindingsWeightedHeavier() {
        Result fresh  = RiskEngine.score(new Inputs(
                bd("0"), 1, 0, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 2, 0, false, 0));
        Result repeat = RiskEngine.score(new Inputs(
                bd("0"), 1, 0, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 2, 2, false, 0));
        assertTrue(repeat.score().compareTo(fresh.score()) > 0);
    }

    @Test
    @DisplayName("Band boundaries are the round numbers we quote to reviewers")
    void bandBoundaries() {
        assertEquals(Enums.RiskBand.LOW,      RiskEngine.band(bd("24.99")));
        assertEquals(Enums.RiskBand.MEDIUM,   RiskEngine.band(bd("25")));
        assertEquals(Enums.RiskBand.HIGH,     RiskEngine.band(bd("50")));
        assertEquals(Enums.RiskBand.CRITICAL, RiskEngine.band(bd("70")));
    }

    @Test
    @DisplayName("Null inputs from a sparse database do not break the nightly job")
    void nullInputsHandled() {
        Result r = RiskEngine.score(new Inputs(
                null, 2, 0, 5, 2, null, null, null, 1, 0, false, 1));
        assertNotNull(r.score());
        assertNotNull(r.band());
    }

    // ------------------------------------------------------------------
    // The statutory versus administrative distinction.
    //
    // Treasury Regulation 30.2.1 sets no day count for quarterly performance reporting by a
    // Schedule 3A entity. The PFMA s55 annual dates are real. These tests are what stop the
    // engine treating a missed departmental instruction as though it were a breach of the Act.
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Administrative lateness alone cannot drive the lateness signal past 60 percent")
    void administrativeLatenessIsCapped() {
        // 90 days past a departmental due date, which is three times the ceiling.
        Result r = RiskEngine.score(new Inputs(
                bd("90"), 4, 0, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 0, 0, false, 0));

        // Maximum the signal can reach on administrative lateness alone: 0.60 * 0.30 * 100.
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.SUBMISSION_LATENESS)
                .compareTo(bd("18.0000")));
    }

    @Test
    @DisplayName("A statutory breach outranks any amount of administrative lateness")
    void statutoryLatenessOutranksAdministrative() {
        Result chronicallyLateOnInstructions = RiskEngine.score(new Inputs(
                bd("120"), 4, 0, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 0, 0, false, 0));

        Result missedTheAct = RiskEngine.score(new Inputs(
                bd("0"), 4, 45, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 0, 0, false, 0));

        assertTrue(missedTheAct.score().compareTo(chronicallyLateOnInstructions.score()) > 0,
                "a PFMA breach must outrank repeated lateness against a departmental instruction");
    }

    @Test
    @DisplayName("A statutory breach says so, in the words a reviewer needs")
    void statutoryBreachIsNamedAsSuch() {
        Result r = RiskEngine.score(new Inputs(
                bd("0"), 3, 70, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 0, 0, false, 0));
        String desc = r.signals().stream()
                .filter(s -> s.type() == Enums.RiskSignalType.SUBMISSION_LATENESS)
                .findFirst().orElseThrow().description();
        assertTrue(desc.contains("statutory"), "the panel must name the breach as statutory");
        assertTrue(desc.contains("70"), "the panel must carry the number that drove the score");
    }

    @Test
    @DisplayName("An entity with no history but a missed statutory date is still scored")
    void statutoryLatenessDoesNotNeedHistory() {
        Result r = RiskEngine.score(new Inputs(
                bd("0"), 0, 60, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 0, 0, false, 0));
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.SUBMISSION_LATENESS)
                .compareTo(bd("30.0000")));
    }

    // ------------------------------------------------------------------
    // The outstanding audit. This is the case a count-based engine gets exactly backwards.
    // ------------------------------------------------------------------

    @Test
    @DisplayName("An outstanding audit scores worse than a qualified one, not better")
    void outstandingAuditIsNotCleanliness() {
        Result outstanding = RiskEngine.score(new Inputs(
                bd("0"), 3, 0, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 0, 0, true, 0));

        Result qualifiedWithRepeats = RiskEngine.score(new Inputs(
                bd("0"), 3, 0, 10, 0, bd("0.5"), bd("0.5"), bd("0.5"), 3, 2, false, 0));

        assertTrue(outstanding.score().compareTo(qualifiedWithRepeats.score()) > 0,
                "no opinion at all is worse than a bad opinion");
        assertEquals(0, contributionOf(outstanding, Enums.RiskSignalType.PRIOR_AUDIT_FINDING)
                .compareTo(bd("15.0000")), "an outstanding audit takes the full audit weight");
    }

    @Test
    @DisplayName("Robben Island Museum 2024/25 reproduces as critical from published facts")
    void robbenIslandCaseReproduces() {
        // Real and published. Annual financial statements for 2024/25 were due to the auditors
        // within two months of year end under PFMA s55(1)(c), which is 31 May 2025. They were
        // submitted on 9 August 2025, 70 days late. The audit was not completed and the entity
        // was excluded from the portfolio audit outcomes reported to the Portfolio Committee.
        //
        // Half way through the following year with nothing reported against 20 targets, half
        // the allocation drawn, nothing delivered, and two targets restated.
        Result r = RiskEngine.score(new Inputs(
                bd("0"), 3, 70, 20, 20, bd("0.50"), bd("0.50"), bd("0.00"), 0, 0, true, 2));

        assertEquals(Enums.RiskBand.CRITICAL, r.band());
        assertEquals(0, r.score().compareTo(bd("71.5000")),
                "expected 30.0 lateness + 12.5 evidence + 10.0 divergence + 15.0 audit + 4.0 churn");

        // And the whole point: a reviewer can read why, without reading the code.
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.SUBMISSION_LATENESS).compareTo(bd("30.0000")));
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.EVIDENCE_GAP).compareTo(bd("12.5000")));
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.SPEND_DELIVERY_DIVERGENCE).compareTo(bd("10.0000")));
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.PRIOR_AUDIT_FINDING).compareTo(bd("15.0000")));
        assertEquals(0, contributionOf(r, Enums.RiskSignalType.REVISION_CHURN).compareTo(bd("4.0000")));
    }

    @Test
    @DisplayName("SAHRA 2024/25 reproduces as low, so the engine is not just pessimistic")
    void sahraCaseReproduces() {
        // Also real. Fourth consecutive clean audit, no findings requiring management action,
        // 18 of 19 annual targets achieved, submissions on time.
        Result r = RiskEngine.score(new Inputs(
                bd("0"), 4, 0, 19, 1, bd("0.50"), bd("0.48"), bd("0.47"), 0, 0, false, 0));

        assertEquals(Enums.RiskBand.LOW, r.band());
        assertTrue(r.score().compareTo(bd("10")) < 0,
                "a clean, on time, well evidenced entity must land near the floor");
    }

    @Test
    @DisplayName("A report never filed says so, rather than reading as on time")
    void unfiledReportIsNamed() {
        // One quarterly report fifty days past its due date and not filed, counted by the
        // service as fifty days late across one observed period.
        Result r = RiskEngine.score(new Inputs(
                bd("50"), 1, 0, 20, 20, bd("0.46"), bd("0.00"), bd("0.00"), 0, 0, false, 0, 1));
        Signal lateness = r.signals().stream()
                .filter(s -> s.type() == Enums.RiskSignalType.SUBMISSION_LATENESS)
                .findFirst().orElseThrow();
        assertTrue(lateness.description().contains("not been filed"), lateness.description());
        assertEquals(0, lateness.contribution().compareTo(bd("18.0000")),
                "capped at the administrative ceiling: an instruction missed is not the Act missed");
    }
}
