package za.gov.dsac.vuka.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * Analytics and Insights: how the portfolio is moving, rather than where it stands today.
 *
 * <h2>What this answers that no other screen does</h2>
 *
 * The portfolio, the risk screen and the entity register all describe one reporting period. None of
 * them can say whether things are getting better. This does, from four series the database already
 * holds, and from nothing else:
 *
 * <ul>
 *   <li><b>Year on year.</b> Allocation per financial year from the ENE, and the Auditor-General's
 *       published outcome and targets-achieved counts per audited year.</li>
 *   <li><b>Who moved.</b> The same entities in two consecutive audited years. A portfolio rate over
 *       nine entities one year and sixteen the next measures who got audited, not who improved, so
 *       the movement is computed only over entities with published counts in both.</li>
 *   <li><b>Quarter by quarter.</b> Filing discipline, delivery against the quarter target, and the
 *       stored risk bands, for every quarter of the current year that has anything in it.</li>
 *   <li><b>By sector.</b> The same, for the quarter under review, split by sector.</li>
 * </ul>
 *
 * <h2>What it refuses</h2>
 *
 * No monthly series, because nothing is stored per month. No cost per outcome across sectors,
 * because a ballet company and a boxing regulator do not produce commensurable outputs; the sector
 * rows carry rands and delivery against each entity's own targets, never one divided by the other.
 * No document view or download counts, because nothing counts them and a log of who read what is
 * personal information under POPIA. And absent stays absent: a year nobody audited carries null
 * rates, not zero, and a quarter not yet due carries no "not filed" count.
 */
@Service
public class AnalyticsService {

    private static final ZoneId ZA = ZoneId.of("Africa/Johannesburg");

    private final PublicEntityRepository entities;
    private final FinancialYearRepository years;
    private final ReportingPeriodRepository periods;
    private final SubmissionRepository submissions;
    private final TargetRepository targets;
    private final TargetResultRepository results;
    private final AllocationRepository allocations;
    private final AuditOutcomeRecordRepository outcomes;
    private final RiskScoreRepository riskScores;
    private final ReportingViewService views;

    public AnalyticsService(PublicEntityRepository entities, FinancialYearRepository years,
                            ReportingPeriodRepository periods, SubmissionRepository submissions,
                            TargetRepository targets, TargetResultRepository results,
                            AllocationRepository allocations, AuditOutcomeRecordRepository outcomes,
                            RiskScoreRepository riskScores, ReportingViewService views) {
        this.entities = entities;
        this.years = years;
        this.periods = periods;
        this.submissions = submissions;
        this.targets = targets;
        this.results = results;
        this.allocations = allocations;
        this.outcomes = outcomes;
        this.riskScores = riskScores;
        this.views = views;
    }

    /* ================================================================== */
    /* views                                                               */
    /* ================================================================== */

    /**
     * One financial year.
     *
     * @param allocated        summed ENE transfers, or null where no allocation row exists for the year
     * @param entitiesAudited  outcome records for the year, zero where the year has not been audited
     * @param targetsAchieved  summed over entities that published both counts; null where none did
     * @param outcomes         AGSA opinion to number of entities, in AGSA's own vocabulary
     */
    public record YearPoint(String financialYear, boolean current, BigDecimal allocated,
                            int entitiesFunded, int entitiesAudited, int entitiesWithCounts,
                            Integer targetsAchieved, Integer targetsTotal, BigDecimal achievedPercent,
                            Map<String, Integer> outcomes, Integer repeatFindings) {}

    public record Movement(UUID entityId, String name, String shortName, String sector,
                           int fromAchieved, int fromTotal, BigDecimal fromPercent,
                           int toAchieved, int toTotal, BigDecimal toPercent,
                           BigDecimal changePoints, String fromOutcome, String toOutcome) {}

    /**
     * Entities with published counts in both years, and the rate over exactly those entities.
     * Null where fewer than two years have been audited.
     */
    public record Cohort(String fromYear, String toYear, int entities,
                         BigDecimal fromPercent, BigDecimal toPercent,
                         int improved, int declined, int unchanged, List<Movement> rows) {}

    /**
     * One quarter of the current year.
     *
     * @param expected    every funded entity, the same population the review queue and the register count
     * @param notFiled    null until the due date has passed, because before then it is not late
     * @param metPercent  figures at or above the quarter target, over figures reported; null where none were
     * @param scored      entities with a stored risk score for the quarter; zero where none has run
     */
    public record QuarterPoint(UUID periodId, String label, Integer quarter, String dueDate,
                               boolean open, boolean fallenDue, int expected, int filed,
                               int onTime, int late, Integer notFiled, int drafts, int approved,
                               int returned, int awaitingReview, Map<String, Integer> channels,
                               int figuresReported, int metTarget, int belowTarget, int noFigure,
                               int figuresVerified, BigDecimal metPercent, int scored,
                               int highOrCritical) {}

    public record SectorRow(String sector, int entities, BigDecimal allocated,
                            BigDecimal allocatedEarliest, int filed, int expected,
                            int figuresReported, int metTarget, BigDecimal metPercent,
                            int scored, int highOrCritical) {}

    /**
     * @param entitiesWithoutTargets entities with no target registered for the current year. They
     *                               still owe a quarterly report, but have nothing to report against
     */
    public record AnalyticsView(String currentYear, String earliestAllocationYear,
                                int entitiesWithoutTargets,
                                UUID reviewPeriodId, String reviewPeriodLabel,
                                List<YearPoint> years, Cohort cohort,
                                List<QuarterPoint> quarters, List<SectorRow> sectors) {}

    /* ================================================================== */
    /* assembly                                                            */
    /* ================================================================== */

    @Transactional(readOnly = true)
    public AnalyticsView analytics() {
        List<FinancialYear> allYears = new ArrayList<>(years.findAll());
        allYears.sort(Comparator.comparing(FinancialYear::getStartDate,
                Comparator.nullsFirst(Comparator.naturalOrder())));
        FinancialYear current = allYears.stream().filter(FinancialYear::isCurrent).findFirst().orElse(null);

        List<PublicEntity> allEntities = entities.findAll();
        List<Allocation> allAllocations = allocations.findAll();
        List<AuditOutcomeRecord> allOutcomes = outcomes.findAll();

        // allocation per year and per entity, read once
        Map<UUID, Map<UUID, BigDecimal>> allocatedByYearEntity = new HashMap<>();
        for (Allocation a : allAllocations) {
            if (a.getFinancialYear() == null || a.getEntity() == null || a.getAmount() == null) continue;
            allocatedByYearEntity
                    .computeIfAbsent(a.getFinancialYear().getId(), k -> new HashMap<>())
                    .merge(a.getEntity().getId(), a.getAmount(), BigDecimal::add);
        }
        FinancialYear earliestAllocated = allYears.stream()
                .filter(fy -> allocatedByYearEntity.containsKey(fy.getId()))
                .findFirst().orElse(null);

        List<YearPoint> yearPoints = yearPoints(allYears, allocatedByYearEntity, allOutcomes);
        Cohort cohort = cohort(allYears, allOutcomes);

        List<QuarterPoint> quarterPoints = new ArrayList<>();
        List<SectorRow> sectorRows = List.of();
        UUID reviewId = views.reviewPeriodId();
        String reviewLabel = null;
        int withoutTargets = 0;

        if (current != null) {
            // Every funded entity owes a quarterly report, targets or not. Counting only those with
            // targets would hide exactly the entities the register flags as having filed nothing.
            Set<UUID> expected = new HashSet<>();
            for (PublicEntity e : allEntities) expected.add(e.getId());

            Set<UUID> withTargets = new HashSet<>();
            for (Target t : targets.findAll()) {
                if (t.getFinancialYear() != null && current.getId().equals(t.getFinancialYear().getId())
                        && t.getEntity() != null) {
                    withTargets.add(t.getEntity().getId());
                }
            }
            withoutTargets = (int) expected.stream().filter(id -> !withTargets.contains(id)).count();

            LocalDate today = LocalDate.now(ZA);
            Map<UUID, QuarterFacts> factsByPeriod = new HashMap<>();
            for (ReportingPeriod p : periods.findByFinancialYearIdOrderByQuarterAsc(current.getId())) {
                QuarterFacts facts = facts(p);
                factsByPeriod.put(p.getId(), facts);
                quarterPoints.add(quarterPoint(p, facts, expected, today));
                if (p.getId().equals(reviewId)) reviewLabel = p.getLabel();
            }

            QuarterFacts review = reviewId == null ? null : factsByPeriod.get(reviewId);
            if (review != null) {
                sectorRows = sectorRows(allEntities, expected, review,
                        allocatedByYearEntity.getOrDefault(current.getId(), Map.of()),
                        earliestAllocated == null || earliestAllocated.getId().equals(current.getId())
                                ? Map.of()
                                : allocatedByYearEntity.getOrDefault(earliestAllocated.getId(), Map.of()));
            }
        }

        return new AnalyticsView(
                current == null ? null : current.getLabel(),
                earliestAllocated == null ? null : earliestAllocated.getLabel(),
                withoutTargets, reviewId, reviewLabel, yearPoints, cohort, quarterPoints, sectorRows);
    }

    /* ---------- year on year ---------- */

    private List<YearPoint> yearPoints(List<FinancialYear> allYears,
                                       Map<UUID, Map<UUID, BigDecimal>> allocatedByYearEntity,
                                       List<AuditOutcomeRecord> allOutcomes) {
        Map<UUID, List<AuditOutcomeRecord>> outcomesByYear = new HashMap<>();
        for (AuditOutcomeRecord r : allOutcomes) {
            if (r.getFinancialYear() == null) continue;
            outcomesByYear.computeIfAbsent(r.getFinancialYear().getId(), k -> new ArrayList<>()).add(r);
        }

        List<YearPoint> out = new ArrayList<>();
        for (FinancialYear fy : allYears) {
            Map<UUID, BigDecimal> alloc = allocatedByYearEntity.get(fy.getId());
            List<AuditOutcomeRecord> recs = outcomesByYear.getOrDefault(fy.getId(), List.of());
            // A year with neither money nor an audit has nothing to say, and a blank row would read
            // as a year in which nothing happened.
            if (alloc == null && recs.isEmpty()) continue;

            int withCounts = 0;
            int achieved = 0;
            int total = 0;
            Integer repeats = null;
            Map<String, Integer> byOutcome = new LinkedHashMap<>();
            for (AuditOutcomeRecord r : recs) {
                if (r.getOutcome() != null) byOutcome.merge(r.getOutcome().name(), 1, Integer::sum);
                if (r.getTargetsAchieved() != null && r.getTargetsTotal() != null && r.getTargetsTotal() > 0) {
                    withCounts++;
                    achieved += r.getTargetsAchieved();
                    total += r.getTargetsTotal();
                }
                if (r.getFindingsRepeat() != null) repeats = (repeats == null ? 0 : repeats) + r.getFindingsRepeat();
            }

            out.add(new YearPoint(
                    fy.getLabel(), fy.isCurrent(),
                    alloc == null ? null : alloc.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add),
                    alloc == null ? 0 : alloc.size(),
                    recs.size(), withCounts,
                    withCounts == 0 ? null : achieved,
                    withCounts == 0 ? null : total,
                    percent(achieved, total),
                    byOutcome, repeats));
        }
        return out;
    }

    /**
     * The two most recent audited years, over entities that published counts in both.
     *
     * <p>Package visible for the test, which is the arithmetic a panel would check by hand.
     */
    static Cohort cohort(List<FinancialYear> allYears, List<AuditOutcomeRecord> allOutcomes) {
        Map<UUID, Map<UUID, AuditOutcomeRecord>> byYearEntity = new HashMap<>();
        for (AuditOutcomeRecord r : allOutcomes) {
            if (r.getFinancialYear() == null || r.getEntity() == null) continue;
            byYearEntity.computeIfAbsent(r.getFinancialYear().getId(), k -> new HashMap<>())
                    .put(r.getEntity().getId(), r);
        }
        List<FinancialYear> audited = allYears.stream()
                .filter(fy -> byYearEntity.containsKey(fy.getId()))
                .toList();
        if (audited.size() < 2) return null;

        FinancialYear from = audited.get(audited.size() - 2);
        FinancialYear to = audited.get(audited.size() - 1);
        Map<UUID, AuditOutcomeRecord> before = byYearEntity.get(from.getId());
        Map<UUID, AuditOutcomeRecord> after = byYearEntity.get(to.getId());

        List<Movement> rows = new ArrayList<>();
        int fa = 0, ft = 0, ta = 0, tt = 0;
        int improved = 0, declined = 0, unchanged = 0;
        for (Map.Entry<UUID, AuditOutcomeRecord> e : after.entrySet()) {
            AuditOutcomeRecord b = before.get(e.getKey());
            AuditOutcomeRecord a = e.getValue();
            if (!hasCounts(b) || !hasCounts(a)) continue;

            BigDecimal bp = percent(b.getTargetsAchieved(), b.getTargetsTotal());
            BigDecimal ap = percent(a.getTargetsAchieved(), a.getTargetsTotal());
            BigDecimal change = ap.subtract(bp);
            int sign = change.signum();
            if (sign > 0) improved++; else if (sign < 0) declined++; else unchanged++;

            fa += b.getTargetsAchieved(); ft += b.getTargetsTotal();
            ta += a.getTargetsAchieved(); tt += a.getTargetsTotal();

            PublicEntity ent = a.getEntity();
            rows.add(new Movement(ent.getId(), ent.getName(), ent.getShortName(),
                    String.valueOf(ent.getSector()),
                    b.getTargetsAchieved(), b.getTargetsTotal(), bp,
                    a.getTargetsAchieved(), a.getTargetsTotal(), ap, change,
                    b.getOutcome() == null ? null : b.getOutcome().name(),
                    a.getOutcome() == null ? null : a.getOutcome().name()));
        }
        // Largest fall first. The screen is for deciding where to look.
        rows.sort(Comparator.comparing(Movement::changePoints).thenComparing(Movement::name));

        return new Cohort(from.getLabel(), to.getLabel(), rows.size(),
                percent(fa, ft), percent(ta, tt), improved, declined, unchanged, rows);
    }

    private static boolean hasCounts(AuditOutcomeRecord r) {
        return r != null && r.getTargetsAchieved() != null && r.getTargetsTotal() != null
                && r.getTargetsTotal() > 0;
    }

    /* ---------- one quarter ---------- */

    /** What one reporting period holds, per entity, read once and used for the quarter and the sectors. */
    record QuarterFacts(Map<UUID, Submission> submissionByEntity,
                        Map<UUID, int[]> figuresByEntity,   // reported, met, below, noFigure, verified
                        Map<UUID, Enums.RiskBand> bandByEntity) {}

    private QuarterFacts facts(ReportingPeriod p) {
        Map<UUID, Submission> subs = new HashMap<>();
        for (Submission s : submissions.findByReportingPeriodId(p.getId())) {
            if (s.getEntity() != null) subs.put(s.getEntity().getId(), s);
        }

        Map<UUID, int[]> figures = new HashMap<>();
        for (Submission s : subs.values()) {
            // A draft's figures have not been stood behind yet.
            if (s.getSubmittedAt() == null || s.getStatus() == Enums.SubmissionStatus.DRAFT) continue;
            int[] f = tally(results.findBySubmissionId(s.getId()),
                    s.getStatus() == Enums.SubmissionStatus.APPROVED);
            figures.put(s.getEntity().getId(), f);
        }

        Map<UUID, Enums.RiskBand> bands = new HashMap<>();
        for (RiskScore rs : riskScores.findByReportingPeriodIdOrderByScoreDesc(p.getId())) {
            if (rs.getEntity() != null && rs.getBand() != null) bands.put(rs.getEntity().getId(), rs.getBand());
        }
        return new QuarterFacts(subs, figures, bands);
    }

    /**
     * Reported, met, below, no figure, verified, over the latest confirmed row per target.
     *
     * <p>Results are append-only, so a figure corrected after a return has two rows, and only the
     * later one is what the entity now stands behind. Met is computed from the figure and the
     * quarter target rather than read from the status column, so the rate is reproducible by hand
     * from the two numbers on the review screen.
     */
    static int[] tally(List<TargetResult> rows, boolean verified) {
        Map<Object, TargetResult> latest = new HashMap<>();
        for (TargetResult r : rows) {
            if (r.getConfirmedAt() == null) continue;
            Object key = r.getTarget() != null ? r.getTarget().getId() : r.getIndicatorRef();
            if (key == null) continue;
            TargetResult seen = latest.get(key);
            if (seen == null || r.getConfirmedAt().isAfter(seen.getConfirmedAt())) latest.put(key, r);
        }
        int reported = 0, met = 0, below = 0, none = 0;
        for (TargetResult r : latest.values()) {
            reported++;
            if (r.getActualValue() == null || r.getQuarterTarget() == null) none++;
            else if (r.getActualValue().compareTo(r.getQuarterTarget()) >= 0) met++;
            else below++;
        }
        return new int[] {reported, met, below, none, verified ? reported : 0};
    }

    private QuarterPoint quarterPoint(ReportingPeriod p, QuarterFacts facts, Set<UUID> expected,
                                      LocalDate today) {
        LocalDate due = p.getSubmissionDueDate();
        boolean fallenDue = due != null && due.isBefore(today);
        boolean open = p.getPeriodStart() != null && !p.getPeriodStart().isAfter(today);

        int filed = 0, onTime = 0, late = 0, drafts = 0, approved = 0, returned = 0, awaiting = 0;
        Set<UUID> filedExpected = new HashSet<>();
        Map<String, Integer> channels = new TreeMap<>();
        for (Submission s : facts.submissionByEntity().values()) {
            if (s.getStatus() == Enums.SubmissionStatus.DRAFT || s.getSubmittedAt() == null) {
                drafts++;
                continue;
            }
            filed++;
            if (expected.contains(s.getEntity().getId())) filedExpected.add(s.getEntity().getId());
            if (s.getChannel() != null) channels.merge(s.getChannel().name(), 1, Integer::sum);
            if (due != null) {
                if (s.getSubmittedAt().atZone(ZA).toLocalDate().isAfter(due)) late++; else onTime++;
            }
            switch (s.getStatus()) {
                case APPROVED -> approved++;
                case RETURNED -> returned++;
                case SUBMITTED, UNDER_REVIEW -> awaiting++;
                default -> { }
            }
        }

        int[] sum = new int[5];
        for (int[] f : facts.figuresByEntity().values()) for (int i = 0; i < 5; i++) sum[i] += f[i];

        int highOrCritical = (int) facts.bandByEntity().values().stream()
                .filter(b -> b == Enums.RiskBand.HIGH || b == Enums.RiskBand.CRITICAL).count();

        return new QuarterPoint(p.getId(), p.getLabel(), p.getQuarter(),
                due == null ? null : due.toString(), open, fallenDue,
                expected.size(), filed, onTime, late,
                fallenDue ? expected.size() - filedExpected.size() : null,
                drafts, approved, returned, awaiting, channels,
                sum[0], sum[1], sum[2], sum[3], sum[4],
                percent(sum[1], sum[1] + sum[2]),
                facts.bandByEntity().size(), highOrCritical);
    }

    /* ---------- by sector ---------- */

    private List<SectorRow> sectorRows(List<PublicEntity> allEntities, Set<UUID> expected,
                                       QuarterFacts facts, Map<UUID, BigDecimal> allocatedNow,
                                       Map<UUID, BigDecimal> allocatedEarliest) {
        Map<Enums.Sector, List<PublicEntity>> bySector = new TreeMap<>();
        for (PublicEntity e : allEntities) {
            if (e.getSector() == null) continue;
            bySector.computeIfAbsent(e.getSector(), k -> new ArrayList<>()).add(e);
        }

        List<SectorRow> out = new ArrayList<>();
        for (Map.Entry<Enums.Sector, List<PublicEntity>> entry : bySector.entrySet()) {
            BigDecimal now = null, then = null;
            int filed = 0, exp = 0, reported = 0, met = 0, below = 0, scored = 0, hc = 0;
            for (PublicEntity e : entry.getValue()) {
                UUID id = e.getId();
                if (allocatedNow.containsKey(id)) now = (now == null ? BigDecimal.ZERO : now).add(allocatedNow.get(id));
                if (allocatedEarliest.containsKey(id)) then = (then == null ? BigDecimal.ZERO : then).add(allocatedEarliest.get(id));
                if (expected.contains(id)) exp++;
                Submission s = facts.submissionByEntity().get(id);
                if (s != null && s.getSubmittedAt() != null && s.getStatus() != Enums.SubmissionStatus.DRAFT) filed++;
                int[] f = facts.figuresByEntity().get(id);
                if (f != null) { reported += f[0]; met += f[1]; below += f[2]; }
                Enums.RiskBand b = facts.bandByEntity().get(id);
                if (b != null) {
                    scored++;
                    if (b == Enums.RiskBand.HIGH || b == Enums.RiskBand.CRITICAL) hc++;
                }
            }
            out.add(new SectorRow(entry.getKey().name(), entry.getValue().size(), now, then,
                    filed, exp, reported, met, percent(met, met + below), scored, hc));
        }
        return out;
    }

    /* ---------- helpers ---------- */

    /** One decimal place, or null where there is nothing to divide by. Never a zero for "no data". */
    static BigDecimal percent(int part, int whole) {
        if (whole <= 0) return null;
        return BigDecimal.valueOf(part).multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(whole), 1, RoundingMode.HALF_UP);
    }
}
