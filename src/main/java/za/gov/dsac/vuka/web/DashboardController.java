package za.gov.dsac.vuka.web;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;
import za.gov.dsac.vuka.service.RiskService;
import za.gov.dsac.vuka.service.UnitCostService;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

/**
 * The DSAC oversight API.
 *
 * The portfolio endpoint orders entities by risk rather than alphabetically. That
 * ordering is the product: an official opens one screen and knows where to look,
 * instead of reading 32 documents to find out.
 */
@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("hasAnyRole('DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
public class DashboardController {

    private final PublicEntityRepository entities;
    private final RiskScoreRepository riskScores;
    private final ReportingPeriodRepository periods;
    private final FinancialYearRepository years;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final AllocationRepository allocations;
    private final AuditFindingRepository findings;
    private final RiskService riskService;
    private final UnitCostService unitCost;

    public DashboardController(PublicEntityRepository entities, RiskScoreRepository riskScores,
                               ReportingPeriodRepository periods, FinancialYearRepository years,
                               TargetRepository targets, TargetResultRepository results,
                               AllocationRepository allocations, AuditFindingRepository findings,
                               RiskService riskService, UnitCostService unitCost) {
        this.entities = entities;
        this.riskScores = riskScores;
        this.periods = periods;
        this.years = years;
        this.targets = targets;
        this.results = results;
        this.allocations = allocations;
        this.findings = findings;
        this.riskService = riskService;
        this.unitCost = unitCost;
    }

    // ---------- portfolio ----------

    public record PortfolioRow(UUID entityId, String name, String shortName, String sector,
                               String entityType, BigDecimal score, String band,
                               BigDecimal previousScore, BigDecimal movement,
                               List<SignalView> signals) {}

    public record SignalView(String type, String description, BigDecimal contribution,
                             BigDecimal weight, BigDecimal value) {}

    /** Every funded body, ranked by risk, each carrying the signals behind its score. */
    @GetMapping("/portfolio")
    public List<PortfolioRow> portfolio(@RequestParam(name = "periodId", required = false) UUID periodId) {
        UUID period = periodId != null ? periodId : currentPeriodId();
        if (period == null) return List.of();

        List<PortfolioRow> rows = new ArrayList<>();
        for (PublicEntity e : entities.findAll()) {
            RiskScore rs = riskScores.findByEntityIdAndReportingPeriodId(e.getId(), period).orElse(null);
            rows.add(toRow(e, rs));
        }
        rows.sort(Comparator.comparing(
                (PortfolioRow r) -> r.score() == null ? BigDecimal.valueOf(-1) : r.score()).reversed());
        return rows;
    }

    private PortfolioRow toRow(PublicEntity e, RiskScore rs) {
        if (rs == null) {
            return new PortfolioRow(e.getId(), e.getName(), e.getShortName(),
                    String.valueOf(e.getSector()), String.valueOf(e.getEntityType()),
                    null, "NOT_SCORED", null, null, List.of());
        }
        BigDecimal movement = rs.getPreviousScore() == null
                ? null : rs.getScore().subtract(rs.getPreviousScore());

        List<SignalView> signals = rs.getSignals().stream()
                .sorted(Comparator.comparing(RiskSignal::getContribution).reversed())
                .map(s -> new SignalView(String.valueOf(s.getType()), s.getDescription(),
                        s.getContribution(), s.getWeight(), s.getValue()))
                .toList();

        return new PortfolioRow(e.getId(), e.getName(), e.getShortName(),
                String.valueOf(e.getSector()), String.valueOf(e.getEntityType()),
                rs.getScore(), String.valueOf(rs.getBand()), rs.getPreviousScore(), movement, signals);
    }

    // ---------- one entity ----------

    public record TargetView(UUID targetId, String indicatorRef, String indicator,
                             String unitOfMeasure, BigDecimal annualTarget,
                             BigDecimal delivered, String status,
                             BigDecimal plannedUnitCost, BigDecimal actualUnitCost,
                             BigDecimal unitCostVariancePercent, String verdict) {}

    public record EntityDetail(UUID entityId, String name, String sector, String mandate,
                               BigDecimal totalAllocation, PortfolioRow risk,
                               List<TargetView> targets, List<FindingView> auditFindings) {}

    public record FindingView(String financialYear, String outcome, String description,
                              boolean repeatFinding, String resolutionStatus) {}

    @GetMapping("/entity/{entityId}")
    public ResponseEntity<EntityDetail> entity(@PathVariable("entityId") UUID entityId,
                                               @RequestParam(name = "periodId", required = false) UUID periodId) {
        PublicEntity e = entities.findById(entityId).orElse(null);
        if (e == null) return ResponseEntity.notFound().build();

        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return ResponseEntity.ok(new EntityDetail(entityId, e.getName(),
                String.valueOf(e.getSector()), e.getMandate(), BigDecimal.ZERO, null, List.of(), List.of()));

        UUID period = periodId != null ? periodId : currentPeriodId();
        RiskScore rs = period == null ? null
                : riskScores.findByEntityIdAndReportingPeriodId(entityId, period).orElse(null);

        BigDecimal total = allocations.findByEntityIdAndFinancialYearId(entityId, fy.getId()).stream()
                .map(Allocation::getAmount).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<TargetView> tvs = new ArrayList<>();
        for (Target t : targets.findByEntityIdAndFinancialYearId(entityId, fy.getId())) {
            List<TargetResult> trs = results.findByTargetId(t.getId());
            BigDecimal delivered = trs.stream().map(TargetResult::getActualValue)
                    .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal actualUC = trs.isEmpty() ? null
                    : trs.get(trs.size() - 1).getActualUnitCost();
            String status = trs.isEmpty() ? "NOT_STARTED"
                    : String.valueOf(trs.get(trs.size() - 1).getStatus());

            UnitCostService.UnitCost uc = unitCost.compare(
                    t.getIndicatorRef(), t.getIndicator(), t.getUnitOfMeasure(),
                    t.getPlannedUnitCost(), actualUC);

            tvs.add(new TargetView(t.getId(), t.getIndicatorRef(), t.getIndicator(),
                    t.getUnitOfMeasure(), t.getAnnualTarget(), delivered, status,
                    t.getPlannedUnitCost(), actualUC, uc.variancePercent(),
                    String.valueOf(uc.verdict())));
        }

        List<FindingView> fvs = findings.findByEntityId(entityId).stream()
                .map(f -> new FindingView(
                        f.getFinancialYear() == null ? "" : f.getFinancialYear().getLabel(),
                        String.valueOf(f.getOutcome()), f.getDescription(),
                        f.isRepeatFinding(), String.valueOf(f.getResolutionStatus())))
                .toList();

        return ResponseEntity.ok(new EntityDetail(entityId, e.getName(),
                String.valueOf(e.getSector()), e.getMandate(), total, toRow(e, rs), tvs, fvs));
    }

    // ---------- peer comparison, sector-bound by construction ----------

    public record PeerComparison(String sector, BigDecimal entityMedianUnitCost,
                                 BigDecimal peerMedianUnitCost, int peerCount, String note) {}

    /**
     * Unit cost against sector peers.
     *
     * The sector filter is not optional and not a query parameter. Comparing cost per
     * outcome across a ballet company and a sports federation is not defensible, so the
     * API does not expose a way to ask for it.
     */
    @GetMapping("/entity/{entityId}/peers")
    public ResponseEntity<PeerComparison> peers(@PathVariable("entityId") UUID entityId) {
        PublicEntity e = entities.findById(entityId).orElse(null);
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (e == null || fy == null) return ResponseEntity.notFound().build();

        BigDecimal own = medianActualUnitCost(e.getId(), fy.getId());

        List<BigDecimal> peerValues = entities.findBySectorAndIdNot(e.getSector(), e.getId()).stream()
                .map(p -> medianActualUnitCost(p.getId(), fy.getId()))
                .filter(Objects::nonNull)
                .toList();

        return ResponseEntity.ok(new PeerComparison(
                String.valueOf(e.getSector()), own, unitCost.peerMedian(peerValues), peerValues.size(),
                "Indicative only. Compared within sector; outcomes are not commensurable across mandates."));
    }

    private BigDecimal medianActualUnitCost(UUID entityId, UUID fyId) {
        List<BigDecimal> values = targets.findByEntityIdAndFinancialYearId(entityId, fyId).stream()
                .flatMap(t -> results.findByTargetId(t.getId()).stream())
                .map(TargetResult::getActualUnitCost)
                .filter(Objects::nonNull)
                .toList();
        return unitCost.peerMedian(values);
    }

    // ---------- recompute ----------

    /** Recomputes scores for every entity. Also runs nightly; this is the demo button. */
    @PostMapping("/recompute")
    @PreAuthorize("hasAnyRole('DSAC_REVIEWER','ADMIN')")
    public Map<String, Object> recompute(@RequestParam(name = "periodId", required = false) UUID periodId,
                                         @AuthenticationPrincipal VukaPrincipal who) {
        UUID period = periodId != null ? periodId : currentPeriodId();
        if (period == null) return Map.of("computed", 0, "reason", "no current reporting period");

        int n = 0;
        for (PublicEntity e : entities.findAll()) {
            riskService.computeAndStore(e.getId(), period);
            n++;
        }
        return Map.of("computed", n, "periodId", period, "at", Instant.now().toString());
    }

    /** The most recent period whose window has opened. */
    private UUID currentPeriodId() {
        FinancialYear fy = years.findByCurrentTrue().orElse(null);
        if (fy == null) return null;
        return periods.findByFinancialYearIdOrderByQuarterAsc(fy.getId()).stream()
                .filter(p -> p.getPeriodStart() != null
                        && !p.getPeriodStart().isAfter(java.time.LocalDate.now()))
                .reduce((a, b) -> b)
                .map(ReportingPeriod::getId)
                .orElse(null);
    }
}
