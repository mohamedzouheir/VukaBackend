package za.gov.dsac.vuka.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import za.gov.dsac.vuka.domain.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The arithmetic behind the analytics screen, which is the part a panel would check by hand.
 */
class AnalyticsServiceTest {

    private static FinancialYear year(String label, int startYear) {
        FinancialYear fy = new FinancialYear();
        fy.setId(UUID.randomUUID());
        fy.setLabel(label);
        fy.setStartDate(LocalDate.of(startYear, 4, 1));
        return fy;
    }

    private static PublicEntity entity(String name) {
        PublicEntity e = new PublicEntity();
        e.setId(UUID.randomUUID());
        e.setName(name);
        e.setShortName(name);
        e.setSector(Enums.Sector.ARTS);
        return e;
    }

    private static AuditOutcomeRecord outcome(PublicEntity e, FinancialYear fy, Integer achieved, Integer total) {
        AuditOutcomeRecord r = new AuditOutcomeRecord();
        r.setEntity(e);
        r.setFinancialYear(fy);
        r.setOutcome(Enums.AuditOutcome.UNQUALIFIED);
        r.setTargetsAchieved(achieved);
        r.setTargetsTotal(total);
        return r;
    }

    @Test
    @DisplayName("Movement is measured only over entities with published counts in both years")
    void cohortIsMatched() {
        FinancialYear y1 = year("2023/24", 2023);
        FinancialYear y2 = year("2024/25", 2024);
        PublicEntity a = entity("A");
        PublicEntity b = entity("B");
        PublicEntity onlyLater = entity("C");
        PublicEntity blankCount = entity("D");

        AnalyticsService.Cohort c = AnalyticsService.cohort(List.of(y1, y2), List.of(
                outcome(a, y1, 8, 10), outcome(a, y2, 5, 10),
                outcome(b, y1, 5, 10), outcome(b, y2, 9, 10),
                outcome(onlyLater, y2, 0, 10),
                outcome(blankCount, y1, 7, 10), outcome(blankCount, y2, null, null)));

        assertNotNull(c);
        assertEquals("2023/24", c.fromYear());
        assertEquals("2024/25", c.toYear());
        assertEquals(2, c.entities(), "C was not audited in both years and D published no count");
        assertEquals(new BigDecimal("65.0"), c.fromPercent());
        assertEquals(new BigDecimal("70.0"), c.toPercent());
        assertEquals(1, c.improved());
        assertEquals(1, c.declined());
        assertEquals("A", c.rows().get(0).name(), "largest fall first");
        assertEquals(new BigDecimal("-30.0"), c.rows().get(0).changePoints());
    }

    @Test
    @DisplayName("One audited year is not a trend")
    void oneYearHasNoCohort() {
        FinancialYear y1 = year("2024/25", 2024);
        assertNull(AnalyticsService.cohort(List.of(y1), List.of(outcome(entity("A"), y1, 1, 2))));
    }

    @Test
    @DisplayName("Only the latest confirmed figure per target counts, and a missing figure is not a miss")
    void tallyReadsLatestRow() {
        Target t1 = new Target();
        t1.setId(UUID.randomUUID());
        Target t2 = new Target();
        t2.setId(UUID.randomUUID());
        Target t3 = new Target();
        t3.setId(UUID.randomUUID());

        Instant first = Instant.parse("2026-07-20T10:00:00Z");
        Instant later = Instant.parse("2026-08-02T10:00:00Z");

        int[] f = AnalyticsService.tally(List.of(
                result(t1, "40", "50", first),      // superseded
                result(t1, "55", "50", later),      // corrected after a return, now met
                result(t2, "10", "20", first),      // below
                result(t3, null, "5", first)),      // recorded absence
                true);

        assertArrayEquals(new int[] {3, 1, 1, 1, 3}, f);
    }

    @Test
    @DisplayName("No denominator gives no rate, not zero percent")
    void percentOfNothingIsNull() {
        assertNull(AnalyticsService.percent(0, 0));
        assertEquals(new BigDecimal("33.3"), AnalyticsService.percent(1, 3));
    }

    private static TargetResult result(Target t, String actual, String quarterTarget, Instant at) {
        TargetResult r = new TargetResult();
        r.setTarget(t);
        r.setActualValue(actual == null ? null : new BigDecimal(actual));
        r.setQuarterTarget(new BigDecimal(quarterTarget));
        r.setConfirmedAt(at);
        return r;
    }
}
