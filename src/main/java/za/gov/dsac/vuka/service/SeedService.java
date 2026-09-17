package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import za.gov.dsac.vuka.domain.*;
import za.gov.dsac.vuka.repository.*;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads the reference dataset on first start, from CSV, so the application is demonstrable
 * against real published figures rather than against invented ones.
 *
 * <h2>What in here is real, and what is not</h2>
 *
 * <b>Real published data, loaded from {@code /data/dsac-entities.csv} and
 * {@code /data/dsac-audit-history.csv}. Both files carry their own provenance headers.</b>
 * <ul>
 *   <li><b>The entity list.</b> The 28 bodies funded through Vote 37, Sport, Arts and Culture.</li>
 *   <li><b>The PFMA schedules.</b> From National Treasury's listing of public institutions as at
 *       21 November 2025. Every DSAC body is Schedule 3A except the Pan South African Language
 *       Board, which is a Schedule 1 constitutional institution. This decides which deadlines
 *       are law and which are the department asking, so it is not decoration.</li>
 *   <li><b>The allocations.</b> Transfers and subsidies from Estimates of National Expenditure
 *       2026, Vote 37, Table 37.3, for 2023/24 through 2026/27. Published in R'000 and
 *       multiplied by 1 000 here.</li>
 *   <li><b>The audit outcomes.</b> From published annual reports and the Auditor-General's
 *       briefing to the Portfolio Committee, in AGSA's own vocabulary, including the one
 *       {@code OUTSTANDING} audit in the portfolio. One {@link AuditOutcomeRecord} per entity
 *       per audited year, carrying the published counts exactly as published, nulls included.</li>
 *   <li><b>The targets-achieved counts</b> in the audit CSV, and the target totals, which are
 *       what the 2026/27 target counts below are sized from.</li>
 *   <li><b>The Robben Island Museum submission date.</b> Annual financial statements submitted
 *       9 August 2025 against a statutory date of 31 May 2025. That single pair of real dates is
 *       what makes statutory lateness computable rather than asserted.</li>
 *   <li><b>The financial year boundaries and the annual statutory deadlines.</b> PFMA s1 ends the
 *       financial year on 31 March; PFMA s55(1)(c) gives two months to the auditors.</li>
 * </ul>
 *
 * <b>Illustrative, generated here so the screens have something to open. None of it is sourced
 * and none of it should be quoted.</b>
 * <ul>
 *   <li><b>The per-indicator wording</b> of every 2026/27 target. Only the <em>number</em> of
 *       targets comes from a published figure; the indicators themselves are plausible sector
 *       phrasing, not the tabled Annual Performance Plans.</li>
 *   <li><b>The quarterly splits</b> of annual targets, and the annual target values themselves.</li>
 *   <li><b>The spend figures</b> on every target result. No published source gives spend per
 *       indicator.</li>
 *   <li><b>Every submission timestamp except the Robben Island one</b>, and the lateness that
 *       follows from them.</li>
 *   <li><b>The programme mapping</b> of each entity to a Vote 37 programme, which is inferred
 *       from sector here.</li>
 *   <li><b>The contact names and addresses</b>, which are placeholders on the reserved
 *       {@code example.org.za} domain.</li>
 *   <li><b>Every workforce figure.</b> Round synthetic headcounts by size band, so the
 *       organisational capacity surfaces have a shape to render. No entity's real staff
 *       establishment is published in these files and none is reproduced here. The demographic
 *       breakdown is deliberately not populated; see {@link #seedWorkforce}.</li>
 * </ul>
 *
 * <h2>Two things this class deliberately does not do</h2>
 *
 * It does not turn a blank cell into a zero. A blank findings count in the audit CSV means the
 * count was never published, and an entity with no published count is not an entity with no
 * findings; that is why {@link AuditOutcomeRecord} takes the counts as boxed nulls and why an
 * {@link AuditFinding} row is written only where a finding is actually published.
 *
 * <p>It does not invent a demographic or racial composition for a named real organisation, and it
 * does not write a mandate it has no source for. A plausible invented figure attached to a real
 * public entity is worse than an empty column, because only one of the two can be quoted back.
 *
 * <p>Set {@code vuka.seed.enabled=false} once the department loads its own data.
 */
@Component
public class SeedService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedService.class);

    private static final String ENTITIES_CSV = "/data/dsac-entities.csv";
    private static final String AUDIT_CSV = "/data/dsac-audit-history.csv";

    private static final ZoneId ZONE = ZoneId.of("Africa/Johannesburg");

    /** The most recent year for which the portfolio audit outcomes are published. */
    private static final String LATEST_AUDITED_YEAR = "2024/25";

    /** The year the demo opens on. */
    private static final String CURRENT_YEAR = "2026/27";

    /**
     * What a quarterly performance due date actually rests on. Treasury Regulation 30.2.1
     * requires quarterly reporting of progress against targets to the executive authority and
     * sets no day count at all; the thirty days everyone quotes comes from a National Treasury
     * guideline. Stored verbatim so the interface can say so.
     */
    private static final String QUARTERLY_CITATION =
            "National Treasury Public Entities Quarterly Reporting Guidelines. Treasury Regulation "
            + "30.2.1 requires quarterly performance reporting to the executive authority but sets "
            + "no day count.";

    /** The annual statutory date, which is the only hard one in the reporting calendar. */
    private static final String ANNUAL_CITATION =
            "PFMA s55(1)(c). Annual financial statements to the auditors within two months of "
            + "financial year end.";

    private final PublicEntityRepository entities;
    private final FinancialYearRepository years;
    private final ReportingPeriodRepository periods;
    private final AllocationRepository allocations;
    private final TargetRepository targets;
    private final SubmissionRepository submissions;
    private final TargetResultRepository results;
    private final AuditFindingRepository findings;
    private final AuditOutcomeRecordRepository outcomes;
    private final WorkforceStatRepository workforce;
    private final RiskService riskService;
    private final UnitCostService unitCost;

    @Value("${vuka.seed.enabled:true}")
    private boolean enabled;

    public SeedService(PublicEntityRepository entities, FinancialYearRepository years,
                       ReportingPeriodRepository periods, AllocationRepository allocations,
                       TargetRepository targets, SubmissionRepository submissions,
                       TargetResultRepository results, AuditFindingRepository findings,
                       AuditOutcomeRecordRepository outcomes, WorkforceStatRepository workforce,
                       RiskService riskService, UnitCostService unitCost) {
        this.entities = entities;
        this.years = years;
        this.periods = periods;
        this.allocations = allocations;
        this.targets = targets;
        this.submissions = submissions;
        this.results = results;
        this.findings = findings;
        this.outcomes = outcomes;
        this.workforce = workforce;
        this.riskService = riskService;
        this.unitCost = unitCost;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) { log.info("Seed disabled"); return; }
        if (entities.count() > 0) { log.info("Data already present, skipping seed"); return; }

        Map<String, FinancialYear> fys = seedYears();
        FinancialYear current = fys.get(CURRENT_YEAR);

        // ---- entities and allocations, from the ENE reference file ----
        Map<String, PublicEntity> byShortName = new LinkedHashMap<>();
        Map<String, Allocation> currentAllocations = new LinkedHashMap<>();
        seedEntitiesAndAllocations(fys, byShortName, currentAllocations);

        // ---- the reporting calendar ----
        List<ReportingPeriod> quarters = seedQuarterlyPeriods(current);
        ReportingPeriod q1 = quarters.get(0);

        // The annual period for the year that was actually audited. This is the one that makes
        // statutory lateness computable: 31 March 2025 year end, statements due 31 May 2025,
        // Robben Island's statements in on 9 August 2025. Seventy real days.
        ReportingPeriod annual2024_25 = seedAnnualPeriod(fys.get("2024/25"));

        // The next annual period, for the year now closing. No submission against it yet; it is
        // here so the countdown surfaces have a live statutory deadline to count towards.
        seedAnnualPeriod(fys.get("2025/26"));

        // ---- audit history, from the AGSA reference file ----
        Map<String, Integer> publishedTargetTotals = seedAuditHistory(fys, byShortName);

        // ---- 2026/27 targets, sized from the published target counts ----
        Map<String, List<Target>> targetsByEntity = new LinkedHashMap<>();
        publishedTargetTotals.forEach((shortName, count) -> {
            PublicEntity e = byShortName.get(shortName);
            Allocation alloc = currentAllocations.get(shortName);
            if (e == null || alloc == null) return;
            targetsByEntity.put(shortName, seedTargets(e, current, alloc, count));
        });

        // ---- Q1 2026/27 reporting, plus the one real late annual submission ----
        seedQuarterlyReporting(byShortName, targetsByEntity, currentAllocations, q1);
        seedRobbenIslandAnnualSubmission(byShortName.get("RobbenIsland"), annual2024_25);

        // ---- organisational capacity. Entirely invented; see the method comment ----
        seedWorkforce(byShortName.values(), q1);

        // Score everything on Q1 so the portfolio opens populated. An entity with no submission
        // and no targets still scores: absence of evidence is the signal, not a missing row.
        entities.findAll().forEach(e -> riskService.computeAndStore(e.getId(), q1.getId()));

        log.info("Seeded {} entities, {} financial years, {} targets for {} from published counts",
                entities.count(), fys.size(),
                targetsByEntity.values().stream().mapToInt(List::size).sum(), CURRENT_YEAR);
    }

    // ------------------------------------------------------------------
    // CSV. Hand written on purpose: no new dependency, and the format is
    // ours, so the parser only has to handle what our files actually contain.
    // ------------------------------------------------------------------

    /**
     * Reads one of the reference files into row maps.
     *
     * <p>Lines starting with {@code #} are provenance commentary and are skipped. The first line
     * that is not a comment is the header. Values are split on comma with a limit equal to the
     * header width, so the final column absorbs any commas inside it — the audit file's
     * {@code note} column contains sentences, and quoting them would have been the other way to
     * solve this. No cell in these files needs an embedded quote or newline, and the parser does
     * not pretend to support either.
     */
    private static List<Map<String, String>> readCsv(String resource) {
        try (InputStream in = SeedService.class.getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Missing classpath resource " + resource);
            }
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            List<String> header = null;
            List<Map<String, String>> rows = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                if (header == null) {
                    header = Arrays.asList(trimmed.split(",", -1));
                    continue;
                }
                String[] cells = trimmed.split(",", header.size());
                Map<String, String> row = new LinkedHashMap<>();
                for (int i = 0; i < header.size(); i++) {
                    row.put(header.get(i), i < cells.length ? cells[i].trim() : "");
                }
                rows.add(row);
            }
            if (header == null) throw new IllegalStateException("No header row in " + resource);
            return rows;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + resource, e);
        }
    }

    /** Blank means absent, never empty string. */
    private static String text(Map<String, String> row, String column) {
        String v = row.get(column);
        return (v == null || v.isEmpty()) ? null : v;
    }

    /**
     * Blank means NOT PUBLISHED, which is why this returns {@code Integer} and never {@code int}.
     * A blank findings count turned into a zero is a claim that the entity had no findings, and
     * that claim would be ours rather than the Auditor-General's.
     */
    private static Integer number(Map<String, String> row, String column) {
        String v = text(row, column);
        return v == null ? null : Integer.valueOf(v);
    }

    // ------------------------------------------------------------------
    // Years and periods
    // ------------------------------------------------------------------

    /**
     * 2023/24 through 2026/27. PFMA s1 defines the financial year of a public entity as ending
     * on 31 March, so every year here runs 1 April to 31 March.
     */
    private Map<String, FinancialYear> seedYears() {
        Map<String, FinancialYear> map = new LinkedHashMap<>();
        for (int startYear = 2023; startYear <= 2026; startYear++) {
            String label = startYear + "/" + String.format("%02d", (startYear + 1) % 100);
            FinancialYear fy = new FinancialYear();
            fy.setLabel(label);
            fy.setStartDate(LocalDate.of(startYear, 4, 1));
            fy.setEndDate(LocalDate.of(startYear + 1, 3, 31));
            fy.setCurrent(CURRENT_YEAR.equals(label));
            map.put(label, years.save(fy));
        }
        return map;
    }

    /**
     * The four quarters of 2026/27.
     *
     * <p>The due date is thirty days after quarter end and it is a <em>departmental
     * instruction</em>, so {@code regulatoryDeadline} is null and the basis says so. Putting a
     * date in the statutory field here would dress up a guideline as an Act, and an entity
     * arguing about a due date is entitled to know which one it is.
     */
    private List<ReportingPeriod> seedQuarterlyPeriods(FinancialYear fy) {
        List<ReportingPeriod> list = new ArrayList<>();
        LocalDate[] ends = {
                LocalDate.of(2026, 6, 30),
                LocalDate.of(2026, 9, 30),
                LocalDate.of(2026, 12, 31),
                LocalDate.of(2027, 3, 31),
        };
        for (int q = 1; q <= 4; q++) {
            ReportingPeriod p = new ReportingPeriod();
            p.setFinancialYear(fy);
            p.setLabel("Q" + q + " " + fy.getLabel());
            p.setQuarter(q);
            p.setPeriodStart(fy.getStartDate().plusMonths(3L * (q - 1)));
            p.setPeriodEnd(ends[q - 1]);
            p.setSubmissionDueDate(ends[q - 1].plusDays(30));
            p.setRegulatoryDeadline(null);
            p.setDeadlineBasis(Enums.DeadlineBasis.DEPARTMENTAL_INSTRUCTION);
            p.setDeadlineCitation(QUARTERLY_CITATION);
            list.add(periods.save(p));
        }
        return list;
    }

    /**
     * The annual period for a year, carrying the PFMA s55(1)(c) date.
     *
     * <p>This is the period against which lateness is a breach of an Act rather than of an
     * instruction, and {@link ReportingPeriod#isStatutory()} is what tells the risk engine to
     * treat it as the worst single breach instead of averaging it into the quarterly mean.
     *
     * <p>{@code submissionDueDate} is set to the same date as the statutory one. It is not a
     * second, softer deadline; the field is populated because the department's own view of the
     * due date is the statutory date, and because a period with a null due date is skipped when
     * lateness is gathered.
     */
    private ReportingPeriod seedAnnualPeriod(FinancialYear fy) {
        LocalDate yearEnd = fy.getEndDate();
        LocalDate statutory = yearEnd.plusMonths(2);   // "within two months of year end"

        ReportingPeriod p = new ReportingPeriod();
        p.setFinancialYear(fy);
        p.setLabel("Annual " + fy.getLabel());
        p.setQuarter(null);
        p.setPeriodStart(fy.getStartDate());
        p.setPeriodEnd(yearEnd);
        p.setSubmissionDueDate(statutory);
        p.setRegulatoryDeadline(statutory);
        p.setDeadlineBasis(Enums.DeadlineBasis.PFMA_55_1_C_STATEMENTS_TO_AUDITOR);
        p.setDeadlineCitation(ANNUAL_CITATION);
        return periods.save(p);
    }

    // ------------------------------------------------------------------
    // Entities and allocations
    // ------------------------------------------------------------------

    /**
     * The 28 funded bodies and their four years of transfers.
     *
     * <p>{@code publiclyVisible} is false for every entity. Publication is a departmental
     * decision and DSAC turns it on; a seed that published on the department's behalf would have
     * made that decision for it. See {@link PublicationService}.
     */
    private void seedEntitiesAndAllocations(Map<String, FinancialYear> fys,
                                            Map<String, PublicEntity> byShortName,
                                            Map<String, Allocation> currentAllocations) {

        for (Map<String, String> row : readCsv(ENTITIES_CSV)) {
            String shortName = text(row, "shortName");

            PublicEntity e = new PublicEntity();
            e.setName(text(row, "name"));
            e.setShortName(shortName);
            e.setEntityType(Enums.EntityType.PUBLIC_ENTITY);
            e.setSector(Enums.Sector.valueOf(text(row, "sector")));
            e.setSizeBand(Enums.SizeBand.valueOf(text(row, "sizeBand")));
            e.setPfmaSchedule(Enums.PfmaSchedule.valueOf(text(row, "pfmaSchedule")));
            // Mandate comes from each entity's founding legislation and is not in the reference
            // file. Left null rather than paraphrased, because a wrong mandate on a real entity
            // is a worse defect than a blank one.
            e.setMandate(null);
            // ILLUSTRATIVE: placeholder contact on the reserved example.org.za domain, so the
            // notification log has an address to print. Not a real inbox.
            e.setContactName("Reporting Officer (placeholder)");
            e.setContactEmail(shortName.toLowerCase() + "@example.org.za");
            e.setPubliclyVisible(Boolean.parseBoolean(row.get("publiclyVisible")));
            entities.save(e);
            byShortName.put(shortName, e);

            for (Map.Entry<String, String> column : allocationColumns().entrySet()) {
                FinancialYear fy = fys.get(column.getKey());
                Integer thousands = number(row, column.getValue());
                if (fy == null || thousands == null) continue;

                Allocation a = new Allocation();
                a.setEntity(e);
                a.setFinancialYear(fy);
                // ILLUSTRATIVE: the entity to programme mapping is inferred from sector. The
                // money is real; which Vote 37 programme line it sits on should be checked
                // against the ENE programme tables before anyone quotes it.
                a.setProgramme(programmeFor(e.getSector()));
                // The ENE publishes transfers in R'000. Stored here in rand.
                a.setAmount(BigDecimal.valueOf(thousands).multiply(BigDecimal.valueOf(1000L)));
                // The appropriation takes effect on the first day of the financial year. The ENE
                // does not publish a per entity approval date, so that is what is recorded.
                a.setDateApproved(fy.getStartDate());
                allocations.save(a);

                if (CURRENT_YEAR.equals(column.getKey())) {
                    currentAllocations.put(shortName, a);
                }
            }
        }
        log.info("Loaded {} entities and their allocations from {}", byShortName.size(), ENTITIES_CSV);
    }

    /** Financial year label to the CSV column holding that year's transfer, in R'000. */
    private static Map<String, String> allocationColumns() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("2023/24", "alloc2023_24");
        m.put("2024/25", "alloc2024_25");
        m.put("2025/26", "alloc2025_26");
        m.put("2026/27", "alloc2026_27");
        return m;
    }

    /** ILLUSTRATIVE mapping. Vote 37 programme titles, assigned by sector. */
    private static String programmeFor(Enums.Sector sector) {
        return switch (sector) {
            case ARTS -> "Programme 3: Arts and Culture Promotion and Development";
            case HERITAGE -> "Programme 4: Heritage Preservation and Promotion";
            case LIBRARIES -> "Programme 4: Heritage Preservation and Promotion";
            case LANGUAGE -> "Programme 3: Arts and Culture Promotion and Development";
            case SPORT -> "Programme 2: Recreation Development and Sport Promotion";
            case OTHER -> "Programme 1: Administration";
        };
    }

    // ------------------------------------------------------------------
    // Audit history
    // ------------------------------------------------------------------

    /**
     * Loads the published audit history, and returns the published 2024/25 target count for each
     * entity that has one, which is what the 2026/27 targets are sized from.
     *
     * <h3>Two different things, two different tables</h3>
     *
     * Every CSV row writes exactly one {@link AuditOutcomeRecord}: the opinion, the counts as
     * published, the targets achieved, the note and a reference to where it came from. The
     * nullable counts pass straight through as nulls. That is the outcome of record, and it exists
     * for every audited year whether or not there is a single finding to go with it.
     *
     * <p>{@link AuditFinding} rows then mean findings and nothing else. No row is written to carry
     * an outcome, because the outcome has a home now:
     *
     * <ul>
     *   <li><b>A published count</b> writes that many rows, of which the published repeat count
     *       are marked as repeats.</li>
     *   <li><b>A published zero</b> writes no rows, which is the true statement.</li>
     *   <li><b>A blank count with a published repeat count</b> writes one row per published
     *       repeat finding. Those repeats are published fact and a lower bound on the total; each
     *       description says the total is unpublished, so the count is never read as complete.</li>
     *   <li><b>A blank count</b> writes nothing, on any outcome. Null means the count was never
     *       published, and the record already says so without a finding row having to stand in
     *       for it.</li>
     *   <li><b>{@code OUTSTANDING}</b> writes nothing either. An outstanding audit has no
     *       findings because there was no audit; the record carries that, and it is worse than
     *       any number of findings would have been.</li>
     * </ul>
     *
     * <p>The wording of individual findings is not published. Descriptions carry the note from the
     * source and say where the row came from; they never invent a finding.
     */
    private Map<String, Integer> seedAuditHistory(Map<String, FinancialYear> fys,
                                                  Map<String, PublicEntity> byShortName) {

        Map<String, Integer> publishedTargetTotals = new LinkedHashMap<>();
        int recordsWritten = 0;
        int rowsWritten = 0;

        for (Map<String, String> row : readCsv(AUDIT_CSV)) {
            String shortName = text(row, "shortName");
            PublicEntity e = byShortName.get(shortName);
            FinancialYear fy = fys.get(text(row, "financialYear"));
            if (e == null || fy == null) {
                log.warn("Audit row for unknown entity or year: {} {}", shortName, text(row, "financialYear"));
                continue;
            }

            Enums.AuditOutcome outcome = Enums.AuditOutcome.valueOf(text(row, "outcome"));
            Integer findingsTotal = number(row, "findingsTotal");
            Integer findingsRepeat = number(row, "findingsRepeat");
            Integer targetsAchieved = number(row, "targetsAchieved");
            Integer targetsTotal = number(row, "targetsTotal");
            String note = text(row, "note");

            if (LATEST_AUDITED_YEAR.equals(fy.getLabel()) && targetsTotal != null) {
                publishedTargetTotals.put(shortName, targetsTotal);
            }

            // ---- the outcome of record, one per entity per audited year ----
            // The boxed counts go in exactly as published. A blank cell arrives here as null and
            // stays null; that is the whole reason the columns are Integer and not int.
            AuditOutcomeRecord record = new AuditOutcomeRecord();
            record.setEntity(e);
            record.setFinancialYear(fy);
            record.setOutcome(outcome);
            record.setFindingsTotal(findingsTotal);
            record.setFindingsRepeat(findingsRepeat);
            record.setTargetsAchieved(targetsAchieved);
            record.setTargetsTotal(targetsTotal);
            record.setNote(note);
            record.setSourceReference(sourceReference(fy.getLabel(), outcome, note));
            outcomes.save(record);
            recordsWritten++;

            // ---- findings, which now mean findings and nothing else ----
            if (outcome == Enums.AuditOutcome.OUTSTANDING) {
                // No audit was completed, so there are no findings to record. The absence is the
                // point and the record above is where it is stated.
                continue;
            }

            int rows;
            int repeats;
            String provenance;
            if (findingsTotal != null) {
                rows = findingsTotal;
                repeats = findingsRepeat == null ? 0 : Math.min(findingsRepeat, rows);
                provenance = rows == 0 ? "" :
                        " The published source gives the count and the outcome, not the wording of "
                        + "each finding.";
            } else if (findingsRepeat != null && findingsRepeat > 0) {
                rows = findingsRepeat;
                repeats = findingsRepeat;
                provenance = " The total number of findings is not published. This row is one of the "
                        + findingsRepeat + " repeat finding(s) the Auditor-General reported, which is "
                        + "a published lower bound and not a count of all findings.";
            } else {
                // Count not published. Nothing is written, on any outcome: the record carries the
                // opinion, and a finding row invented to carry it would be counted as a finding.
                continue;
            }

            // Resolution is not published per finding. Everything is recorded OPEN unless the
            // source note says the findings were raised and resolved within the same year.
            Enums.ResolutionStatus resolution =
                    note != null && note.toLowerCase().contains("raised and resolved")
                            ? Enums.ResolutionStatus.RESOLVED
                            : Enums.ResolutionStatus.OPEN;

            for (int i = 0; i < rows; i++) {
                String description = (note == null ? "Audit outcome " + outcome + "." : note)
                        + (rows > 1 ? " Finding " + (i + 1) + " of " + rows + "." : "")
                        + provenance;
                writeFinding(e, fy, outcome, description, i < repeats, resolution);
                rowsWritten++;
            }
        }

        log.info("Loaded {} audit outcome records and {} published finding rows from {}; "
                 + "{} entities have a published {} target count",
                recordsWritten, rowsWritten, AUDIT_CSV,
                publishedTargetTotals.size(), LATEST_AUDITED_YEAR);
        return publishedTargetTotals;
    }

    /**
     * Where a row came from, so a reviewer can go and read it.
     *
     * <p>The CSV has no source column, so this is inferred from the row itself: an outstanding
     * audit and any note that speaks about the portfolio or names the Auditor-General come from
     * the AGSA briefing to the Portfolio Committee, and everything else from the entity's own
     * annual report for that year. It is a reasonable inference and it is still an inference; a
     * {@code sourceReference} column in the CSV would retire this method and should.
     */
    private static String sourceReference(String yearLabel, Enums.AuditOutcome outcome, String note) {
        String lower = note == null ? "" : note.toLowerCase();
        boolean fromBriefing = outcome == Enums.AuditOutcome.OUTSTANDING
                || lower.contains("portfolio") || lower.contains("agsa");
        return fromBriefing
                ? "AGSA briefing to the Portfolio Committee on Sport, Arts and Culture, "
                  + yearLabel + " portfolio audit outcomes"
                : "Annual report " + yearLabel;
    }

    private void writeFinding(PublicEntity e, FinancialYear fy, Enums.AuditOutcome outcome,
                              String description, boolean repeat, Enums.ResolutionStatus resolution) {
        AuditFinding f = new AuditFinding();
        f.setEntity(e);
        f.setFinancialYear(fy);
        f.setOutcome(outcome);
        f.setDescription(description.length() > 2000 ? description.substring(0, 2000) : description);
        f.setRepeatFinding(repeat);
        f.setResolutionStatus(resolution);
        findings.save(f);
    }

    // ------------------------------------------------------------------
    // Targets
    // ------------------------------------------------------------------

    /**
     * Creates one financial year's worth of targets for an entity.
     *
     * <p>The <em>count</em> is the entity's published 2024/25 target count, carried forward on the
     * assumption that a plan of the same size was tabled for 2026/27. Everything else on the row
     * is ILLUSTRATIVE: the indicator wording is plausible sector phrasing rather than the tabled
     * Annual Performance Plan, and the annual and quarterly values are generated.
     *
     * <p>Every target is version 1, effective from the first day of the year, superseded on
     * nothing, with no revision trigger. That is what an as-tabled plan looks like. A target is
     * never edited in this system; a lawful revision opens a new version and closes this one, so
     * seeding anything other than a clean version 1 would be seeding a re-tabling that did not
     * happen.
     */
    private List<Target> seedTargets(PublicEntity e, FinancialYear fy, Allocation alloc, int count) {
        String[] wordings = indicatorWordings(e.getSector());
        String unit = unitOfMeasure(e.getSector());
        String prefix = indicatorPrefix(e.getSector());

        BigDecimal perTarget = alloc.getAmount() == null ? null
                : alloc.getAmount().divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);

        List<Target> created = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Target t = new Target();
            t.setEntity(e);
            t.setFinancialYear(fy);
            t.setAllocation(alloc);
            t.setIndicatorRef(prefix + "-" + (i / 5 + 1) + "." + (i % 5 + 1));
            t.setOutcomeStatement(outcomeStatement(e.getSector()));
            t.setOutputStatement(outputStatement(e.getSector()));

            String wording = wordings[i % wordings.length];
            if (i >= wordings.length) wording = wording + " (stream " + (i / wordings.length + 1) + ")";
            t.setIndicator(wording);
            t.setUnitOfMeasure(unit);

            // ILLUSTRATIVE values. Spread so the dashboard is not a column of identical numbers.
            BigDecimal annual = BigDecimal.valueOf(12L + ((i * 6L) % 48L));
            t.setAnnualTarget(annual);
            t.setBaseline(annual.multiply(new BigDecimal("0.90")).setScale(0, RoundingMode.HALF_UP));

            // ILLUSTRATIVE even split. Real APPs load quarters unevenly.
            BigDecimal perQuarter = annual.divide(BigDecimal.valueOf(4), 0, RoundingMode.HALF_UP);
            t.setQ1Target(perQuarter);
            t.setQ2Target(perQuarter);
            t.setQ3Target(perQuarter);
            t.setQ4Target(annual.subtract(perQuarter.multiply(BigDecimal.valueOf(3))));

            // Allocation is real; the even division of it across targets is illustrative, so the
            // planned unit cost is only as sound as that division.
            t.setPlannedUnitCost(unitCost.plannedUnitCost(perTarget, annual));

            t.setRevisionCount(0);
            t.setVersion(1);
            t.setSupersedes(null);
            t.setEffectiveFrom(fy.getStartDate());
            t.setSupersededOn(null);
            t.setRevisionTrigger(null);
            t.setRetablingReference("APP 2026/27 as tabled");

            created.add(targets.save(t));
        }
        return created;
    }

    private static String indicatorPrefix(Enums.Sector sector) {
        return switch (sector) {
            case ARTS -> "ART";
            case HERITAGE -> "HER";
            case LIBRARIES -> "LIB";
            case LANGUAGE -> "LAN";
            case SPORT -> "SPT";
            case OTHER -> "OTH";
        };
    }

    private static String unitOfMeasure(Enums.Sector sector) {
        return switch (sector) {
            case ARTS -> "productions and performances";
            case HERITAGE -> "exhibitions and collection items";
            case LIBRARIES -> "titles and items";
            case LANGUAGE -> "language outputs";
            case SPORT -> "tests and sanctioned events";
            case OTHER -> "activities";
        };
    }

    /** ILLUSTRATIVE indicator wording. Plausible for the sector, not taken from any tabled APP. */
    private static String[] indicatorWordings(Enums.Sector sector) {
        return switch (sector) {
            case ARTS -> new String[]{
                    "Number of productions staged",
                    "Number of performances delivered",
                    "Number of artists provided with work opportunities",
                    "Number of arts development programmes delivered",
                    "Number of touring productions supported",
                    "Number of community outreach performances held",
                    "Number of bursaries and internships awarded",
                    "Number of audience development initiatives implemented"};
            case HERITAGE -> new String[]{
                    "Number of exhibitions mounted",
                    "Number of collection items catalogued",
                    "Number of public education programmes delivered",
                    "Number of heritage sites maintained",
                    "Number of learners reached through outreach",
                    "Number of digitised collection records published",
                    "Number of conservation interventions completed",
                    "Number of community heritage projects supported"};
            case LIBRARIES -> new String[]{
                    "Number of titles catalogued",
                    "Number of items acquired for the national collection",
                    "Number of items conserved",
                    "Number of digitised items published online",
                    "Number of legal deposit items processed",
                    "Number of reading promotion events held",
                    "Number of bibliographic records contributed",
                    "Number of library users served"};
            case LANGUAGE -> new String[]{
                    "Number of terminology lists developed",
                    "Number of language rights complaints resolved",
                    "Number of translation and editing outputs delivered",
                    "Number of provincial language structures supported",
                    "Number of literature development projects supported",
                    "Number of language awareness campaigns run",
                    "Number of lexicography units monitored",
                    "Number of multilingual publications produced"};
            case SPORT -> new String[]{
                    "Number of athletes tested",
                    "Number of sanctioned events held",
                    "Number of education and awareness sessions delivered",
                    "Number of licensed officials trained",
                    "Number of compliance inspections conducted",
                    "Number of development programmes supported",
                    "Number of outreach activities held",
                    "Number of hearings concluded"};
            case OTHER -> new String[]{"Number of activities delivered"};
        };
    }

    private static String outcomeStatement(Enums.Sector sector) {
        return switch (sector) {
            case ARTS -> "A transformed and productive arts sector.";
            case HERITAGE -> "A preserved and accessible national heritage.";
            case LIBRARIES -> "A nation with access to its documentary heritage.";
            case LANGUAGE -> "Functional multilingualism across the official languages.";
            case SPORT -> "An active nation competing in a clean sporting environment.";
            case OTHER -> "Improved service delivery.";
        };
    }

    private static String outputStatement(Enums.Sector sector) {
        return switch (sector) {
            case ARTS -> "Arts programmes and performance opportunities delivered.";
            case HERITAGE -> "Heritage collections conserved and made publicly accessible.";
            case LIBRARIES -> "Collections built, conserved and made available.";
            case LANGUAGE -> "Language development and language rights services delivered.";
            case SPORT -> "Regulation, testing and development services delivered.";
            case OTHER -> "Services delivered.";
        };
    }

    // ------------------------------------------------------------------
    // Reporting
    // ------------------------------------------------------------------

    /**
     * One Q1 2026/27 reporting profile.
     *
     * <p>Every field here is ILLUSTRATIVE. These are the shapes the risk bands are meant to
     * demonstrate, not observations: an entity that reported everything on time, entities that
     * reported some of their indicators late, and an entity that did not report at all.
     *
     * @param daysLate     days after the departmental due date the report arrived
     * @param reported     how many of the entity's targets were reported against
     * @param deliveryRate actual delivery as a fraction of the quarterly target
     * @param spendRate    spend as a fraction of the annual allocation behind each target
     */
    private record Q1Profile(int daysLate, int reported, double deliveryRate, double spendRate) {}

    /**
     * ILLUSTRATIVE Q1 2026/27 reporting behaviour, by entity.
     *
     * <p>Robben Island Museum is deliberately absent: it has no Q1 submission at all, which with
     * its outstanding audit and its seventy day statutory breach is the portfolio's worst
     * position and should read that way on the dashboard. SAHRA reported all nineteen indicators
     * on the due date. The National Library and Boxing South Africa reported part of their
     * indicators, late, which is the evidence gap signal doing its job.
     */
    private static Map<String, Q1Profile> q1Profiles() {
        Map<String, Q1Profile> m = new LinkedHashMap<>();
        m.put("SAHRA", new Q1Profile(0, 19, 0.95, 0.24));
        m.put("SAIDS", new Q1Profile(1, 21, 0.93, 0.25));
        m.put("MarketTheatre", new Q1Profile(2, 36, 0.94, 0.24));
        m.put("Artscape", new Q1Profile(3, 12, 0.90, 0.25));
        m.put("NAC", new Q1Profile(4, 22, 0.92, 0.23));
        m.put("Playhouse", new Q1Profile(5, 20, 0.88, 0.26));
        m.put("PACOFS", new Q1Profile(9, 18, 0.80, 0.28));
        m.put("Iziko", new Q1Profile(11, 12, 0.68, 0.31));
        m.put("NLSA", new Q1Profile(12, 10, 0.61, 0.34));
        m.put("FreedomPark", new Q1Profile(14, 21, 0.70, 0.33));
        m.put("PanSALB", new Q1Profile(18, 18, 0.62, 0.38));
        m.put("BoxingSA", new Q1Profile(25, 7, 0.44, 0.41));
        return m;
    }

    private void seedQuarterlyReporting(Map<String, PublicEntity> byShortName,
                                        Map<String, List<Target>> targetsByEntity,
                                        Map<String, Allocation> currentAllocations,
                                        ReportingPeriod q1) {

        for (Map.Entry<String, Q1Profile> entry : q1Profiles().entrySet()) {
            String shortName = entry.getKey();
            Q1Profile profile = entry.getValue();
            PublicEntity e = byShortName.get(shortName);
            List<Target> entityTargets = targetsByEntity.get(shortName);
            Allocation alloc = currentAllocations.get(shortName);
            if (e == null || entityTargets == null || entityTargets.isEmpty()) continue;

            // ILLUSTRATIVE timestamps. The due date is real; the arrival is invented.
            Instant submittedAt = q1.getSubmissionDueDate().plusDays(profile.daysLate())
                    .atStartOfDay(ZONE).toInstant();

            Submission sub = new Submission();
            sub.setEntity(e);
            sub.setReportingPeriod(q1);
            sub.setStatus(Enums.SubmissionStatus.APPROVED);
            sub.setChannel(Enums.SubmissionChannel.WEB);
            sub.setCreatedAt(q1.getPeriodEnd().atStartOfDay(ZONE).toInstant());
            sub.setSubmittedAt(submittedAt);
            sub.setSubmittedByUid("seed-reporter-" + shortName.toLowerCase());
            sub.setSubmittedByName("Reporting Officer (placeholder)");
            submissions.save(sub);

            BigDecimal perTargetAllocation = alloc == null || alloc.getAmount() == null ? null
                    : alloc.getAmount().divide(BigDecimal.valueOf(entityTargets.size()), 2, RoundingMode.HALF_UP);

            int reported = Math.min(profile.reported(), entityTargets.size());
            for (int i = 0; i < reported; i++) {
                Target t = entityTargets.get(i);
                BigDecimal quarterTarget = t.getQ1Target();
                BigDecimal actual = quarterTarget.multiply(BigDecimal.valueOf(profile.deliveryRate()))
                        .setScale(0, RoundingMode.HALF_UP);

                // ILLUSTRATIVE spend. No published source gives spend per indicator, so this is a
                // fraction of the target's share of a real allocation, which is a shape and not a
                // figure. Do not quote it.
                BigDecimal spend = perTargetAllocation == null ? null
                        : perTargetAllocation.multiply(BigDecimal.valueOf(profile.spendRate()))
                            .setScale(2, RoundingMode.HALF_UP);

                TargetResult r = new TargetResult();
                r.setTarget(t);
                r.setSubmission(sub);
                r.setIndicatorRef(t.getIndicatorRef());
                r.setActualValue(actual);
                r.setQuarterTarget(quarterTarget);
                r.setVariance(actual.subtract(quarterTarget));
                r.setVarianceExplanation(actual.compareTo(quarterTarget) < 0
                        ? "Delivery deferred to the following quarter. (Illustrative explanation.)"
                        : null);
                r.setSpendToDate(spend);
                r.setActualUnitCost(unitCost.actualUnitCost(spend, actual));
                r.setStatus(actual.compareTo(quarterTarget) >= 0
                        ? Enums.TargetStatus.ACHIEVED : Enums.TargetStatus.IN_PROGRESS);
                r.setConfirmedByUid("seed-reporter-" + shortName.toLowerCase());
                r.setConfirmedByName("Reporting Officer (placeholder)");
                r.setConfirmedAt(submittedAt);
                results.save(r);
            }
        }
    }

    // ------------------------------------------------------------------
    // Organisational capacity
    // ------------------------------------------------------------------

    /**
     * ILLUSTRATIVE workforce figures, so the organisational capacity surfaces have a shape to
     * render. <b>Every number below is invented and none of it should be quoted.</b>
     *
     * <p>The headcounts are deliberately round — 300, 100, 20 by size band — because a round
     * number reads as a placeholder and 287 would read as a fact. No entity's staff establishment
     * is published in the reference files, so there is nothing here to be faithful to.
     *
     * <h3>What is not populated, and why the zeroes are a model defect</h3>
     *
     * The gender, youth and disability counts are left alone. Inventing a demographic split for a
     * named real public entity is not a placeholder, it is a fabricated claim about an
     * organisation that exists, and the fact that it would render nicely on a chart is exactly
     * what makes it dangerous.
     *
     * <p>Those fields are {@code Integer} on {@link WorkforceStat} and the columns are nullable,
     * so the fields this method declines to set stay genuinely null rather than defaulting to
     * zero. That distinction is the whole point. A zero in a demographic column is a claim, and
     * for a named real organisation it is a false one: no women on the staff, nobody with a
     * disability. Null means not captured, and any surface reading these renders it as "not
     * reported" rather than as a figure. {@code jobsCreated} is left null for the same reason.
     *
     * <p>This is the same defect that boxing {@code findingsTotal} on {@link AuditOutcomeRecord}
     * fixed for audit counts. It is worth stating twice because it is the single easiest mistake
     * to make in a reporting system and the hardest to notice once it is on a chart.
     */
    private void seedWorkforce(java.util.Collection<PublicEntity> all, ReportingPeriod period) {
        for (PublicEntity e : all) {
            WorkforceStat w = new WorkforceStat();
            w.setEntity(e);
            w.setReportingPeriod(period);
            w.setHeadcount(illustrativeHeadcount(e.getSizeBand()));
            // Demographic and jobs-created fields deliberately not set. See the comment above.
            workforce.save(w);
        }
        log.info("Seeded {} illustrative workforce rows. Headcounts are invented placeholders.",
                all.size());
    }

    /** ILLUSTRATIVE. Round on purpose, so no one mistakes it for an establishment figure. */
    private static int illustrativeHeadcount(Enums.SizeBand band) {
        return switch (band) {
            case LARGE -> 300;
            case MEDIUM -> 100;
            case SMALL -> 20;
        };
    }

    /**
     * The one submission in this dataset whose dates are real.
     *
     * <p>Robben Island Museum's 2024/25 annual financial statements were submitted on 9 August
     * 2025. The statements were due to the auditors by 31 May 2025 under PFMA s55(1)(c), two
     * months after the 31 March 2025 year end. That is seventy days, the audit was not completed,
     * and the entity was excluded from the portfolio audit outcomes altogether.
     *
     * <p>This is the row that makes statutory lateness a computed number rather than an
     * assertion. Everything else in the seed could be swapped for other illustrative figures
     * without changing what the product demonstrates. This one could not.
     *
     * <p>The submitter identity and the channel are placeholders; only the dates are sourced.
     */
    private void seedRobbenIslandAnnualSubmission(PublicEntity robbenIsland, ReportingPeriod annual) {
        if (robbenIsland == null) {
            log.warn("Robben Island Museum not found in the entity file; the statutory lateness "
                    + "example was not seeded");
            return;
        }
        Submission sub = new Submission();
        sub.setEntity(robbenIsland);
        sub.setReportingPeriod(annual);
        sub.setStatus(Enums.SubmissionStatus.SUBMITTED);
        sub.setChannel(Enums.SubmissionChannel.EMAIL);
        sub.setCreatedAt(LocalDate.of(2025, 8, 9).atStartOfDay(ZONE).toInstant());
        sub.setSubmittedAt(LocalDate.of(2025, 8, 9).atStartOfDay(ZONE).toInstant());
        sub.setSubmittedByUid("seed-robben-island");
        sub.setSubmittedByName("Entity finance office (placeholder)");
        submissions.save(sub);
    }
}
