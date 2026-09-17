package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import za.gov.dsac.vuka.domain.Enums;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Unit cost: what an outcome actually cost, against what the entity said it would cost.
 *
 * <h2>The comparison that is defensible, and the one that is not</h2>
 *
 * Every dashboard at a government hackathon shows targets in red, amber and green.
 * That answers "did they report". This answers "was the money worth it", which is the
 * question the department actually has.
 *
 * It does so carefully. Three comparisons are offered, in descending order of how well
 * they survive scrutiny:
 *
 * <ol>
 *   <li><b>Entity against its own plan.</b> The APP states a target and the allocation
 *       behind it; dividing gives planned cost per unit. Comparing actual against that
 *       is unarguable, because it is the entity's own commitment.</li>
 *   <li><b>Entity against its own history.</b> Unit cost this year against last.</li>
 *   <li><b>Entity against sector peers.</b> Only within a matching {@link Enums.Sector}.</li>
 * </ol>
 *
 * A fourth comparison — cost per outcome across different sectors — is deliberately
 * not implemented. A ballet company and a sports federation do not produce commensurable
 * outputs, and anyone in the room with a public finance background will say so. The
 * absence of that method is the design decision.
 */
@Service
public class UnitCostService {

    private static final int SCALE = 2;

    /** One target's planned versus actual unit economics. */
    public record UnitCost(
            String indicatorRef,
            String indicator,
            String unitOfMeasure,
            BigDecimal plannedUnitCost,
            BigDecimal actualUnitCost,
            BigDecimal variancePercent,
            Verdict verdict
    ) {}

    public enum Verdict {
        /** Delivered at or below planned cost. */
        ON_OR_UNDER,
        /** Up to 25 percent above planned cost. */
        MODESTLY_OVER,
        /** More than 25 percent above planned cost. */
        SUBSTANTIALLY_OVER,
        /** Cannot be computed: no plan, or nothing delivered yet. */
        NOT_COMPARABLE
    }

    /**
     * Planned unit cost for a target: the allocation behind it divided by the annual target.
     *
     * @return null when there is no allocation or the target is zero, rather than a
     *         misleading zero or an exception. Absence of a figure is information.
     */
    public BigDecimal plannedUnitCost(BigDecimal allocationAmount, BigDecimal annualTarget) {
        if (allocationAmount == null || annualTarget == null) return null;
        if (annualTarget.compareTo(BigDecimal.ZERO) == 0) return null;
        return allocationAmount.divide(annualTarget, SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Actual unit cost: spend to date divided by what was actually delivered.
     *
     * <p>Returns null when nothing has been delivered. Dividing spend by zero delivery
     * would produce infinity, and reporting that as "infinitely expensive" would be
     * arithmetically true and practically useless — a target not yet started is an
     * evidence gap, which the risk engine already handles.
     */
    public BigDecimal actualUnitCost(BigDecimal spendToDate, BigDecimal actualValue) {
        if (spendToDate == null || actualValue == null) return null;
        if (actualValue.compareTo(BigDecimal.ZERO) <= 0) return null;
        return spendToDate.divide(actualValue, SCALE, RoundingMode.HALF_UP);
    }

    /** Builds the planned-versus-actual comparison for one target. */
    public UnitCost compare(String indicatorRef, String indicator, String unitOfMeasure,
                            BigDecimal plannedUnitCost, BigDecimal actualUnitCost) {

        if (plannedUnitCost == null || actualUnitCost == null
                || plannedUnitCost.compareTo(BigDecimal.ZERO) == 0) {
            return new UnitCost(indicatorRef, indicator, unitOfMeasure,
                    plannedUnitCost, actualUnitCost, null, Verdict.NOT_COMPARABLE);
        }

        BigDecimal variance = actualUnitCost.subtract(plannedUnitCost)
                .divide(plannedUnitCost, 4, RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"))
                .setScale(1, RoundingMode.HALF_UP);

        Verdict verdict;
        if (variance.compareTo(BigDecimal.ZERO) <= 0) {
            verdict = Verdict.ON_OR_UNDER;
        } else if (variance.compareTo(new BigDecimal("25")) <= 0) {
            verdict = Verdict.MODESTLY_OVER;
        } else {
            verdict = Verdict.SUBSTANTIALLY_OVER;
        }

        return new UnitCost(indicatorRef, indicator, unitOfMeasure,
                plannedUnitCost, actualUnitCost, variance, verdict);
    }

    /**
     * Median actual unit cost across a peer set.
     *
     * <p>The caller is responsible for having filtered to a single sector. This method
     * deliberately takes plain figures rather than entities, so it cannot be misused to
     * silently compare across sectors: the filtering decision has to be made and seen
     * somewhere a reviewer can read it.
     *
     * <p>Median rather than mean, because one entity with a tiny denominator would drag
     * an average anywhere.
     */
    public BigDecimal peerMedian(List<BigDecimal> peerUnitCosts) {
        List<BigDecimal> values = peerUnitCosts.stream()
                .filter(v -> v != null && v.compareTo(BigDecimal.ZERO) > 0)
                .sorted()
                .toList();

        if (values.isEmpty()) return null;

        int n = values.size();
        if (n % 2 == 1) return values.get(n / 2);
        return values.get(n / 2 - 1)
                .add(values.get(n / 2))
                .divide(new BigDecimal("2"), SCALE, RoundingMode.HALF_UP);
    }
}
