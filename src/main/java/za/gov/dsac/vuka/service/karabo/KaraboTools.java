package za.gov.dsac.vuka.service.karabo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import za.gov.dsac.vuka.config.Capability;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.domain.Submission;
import za.gov.dsac.vuka.repository.PublicEntityRepository;
import za.gov.dsac.vuka.repository.SubmissionRepository;
import za.gov.dsac.vuka.service.PublicationService;
import za.gov.dsac.vuka.service.ReportingViewService;
import za.gov.dsac.vuka.web.DashboardController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * What Karabo can read, and for whom.
 *
 * <h2>The rule</h2>
 *
 * A reply can never say anything the caller's own account could not have read. That is an access
 * control question, not a model question, and it is answered here in two ways.
 *
 * <p><b>Nobody signed in</b> gets two tools, both over {@link PublicationService}: the same
 * projection the citizen view renders. Published entities only, and no risk scores, no
 * unconfirmed figures, no comments. An unpublished entity is not found, exactly as it is on
 * {@code /public}. The internal tools are not offered at all, so there is nothing to talk the
 * model into calling.
 *
 * <p><b>Someone signed in</b> gets tools that go through the dashboard's own controllers, called
 * as beans. Spring runs their {@code @PreAuthorize} and their tenancy check against the security
 * context of the request, which is the caller's, so a reporter asking about another entity gets
 * the same not found the dashboard would give them. Where a tool reads a service directly, it
 * applies the same scope explicitly: the whole portfolio for a role holding
 * {@link Capability#VIEW_PORTFOLIO}, the caller's own entity for a reporter, nothing otherwise.
 *
 * <h2>Where sources come from</h2>
 *
 * Every tool result carries the citation of what it read, and those are what the panel shows
 * under the answer. They are collected here, from the tools that actually ran, rather than taken
 * from the model's text, so a source line cannot be invented.
 */
@Component
public class KaraboTools {

    /** A citation shown under an answer. */
    public record Source(String label, String reference) {}

    /** What one tool call produced: data for the model, citations for the reader. */
    public record Result(JsonNode data, List<Source> sources) {}

    private static final String ENE = "Estimates of National Expenditure 2026, Vote 37, Table 37.3";

    private final ObjectMapper json;
    private final PublicEntityRepository entities;
    private final SubmissionRepository submissions;
    private final PublicationService publication;
    private final ReportingViewService views;
    private final DashboardController dashboard;

    public KaraboTools(ObjectMapper json, PublicEntityRepository entities,
                       SubmissionRepository submissions, PublicationService publication,
                       ReportingViewService views, DashboardController dashboard) {
        this.json = json;
        this.entities = entities;
        this.submissions = submissions;
        this.publication = publication;
        this.views = views;
        this.dashboard = dashboard;
    }

    /* ================================================================== */
    /* definitions                                                         */
    /* ================================================================== */

    /** The tools on offer to this caller. An anonymous caller is never offered an internal one. */
    public ArrayNode definitionsFor(VukaPrincipal who) {
        ArrayNode tools = json.createArrayNode();
        if (who == null) {
            tools.add(tool("list_published_entities",
                    "Every entity the Department has published, with its sector, its allocation for the "
                            + "current financial year, and how many of its targets were achieved, in progress, "
                            + "missed or not started. Use for questions about published entities in general.",
                    params()));
            tools.add(tool("get_published_entity",
                    "One published entity by name or short name, with its mandate, allocation and target "
                            + "outcomes. Returns not found for an entity that is not published.",
                    params("entity", "The entity's name or short name, as the reader wrote it")));
            return tools;
        }

        tools.add(tool("find_entities",
                "Search the entities this reader may see, by name or short name. Use to resolve a name "
                        + "before another tool when unsure which entity is meant.",
                params("query", "Part of the entity's name or short name")));
        tools.add(tool("get_entity_overview",
                "One entity's accountability chain for the current financial year: the allocation and "
                        + "where it is published, how many targets were promised, how many figures were "
                        + "reported and verified with evidence, how many have no evidence, and the "
                        + "allocation in earlier years.",
                params("entity", "The entity's name, short name or id")));
        tools.add(tool("get_entity_risk",
                "One entity's stored risk score for the review quarter, its band, its movement since the "
                        + "last quarter, and the signals behind it with what each contributed. The score is "
                        + "arithmetic over stored signals, not a prediction.",
                params("entity", "The entity's name, short name or id")));
        tools.add(tool("list_reporting_status",
                "For one quarter of the current year: its due date and whether that date is statutory or "
                        + "a departmental instruction, and for each entity whether it submitted, how late, or "
                        + "whether nothing was filed. Use for questions about lateness or deadlines.",
                params("quarter", "Quarter number 1 to 4. Leave empty for the quarter under review")));
        tools.add(tool("list_figures_without_evidence",
                "Reported figures that have no evidence document attached, which the Auditor-General "
                        + "would treat as unverifiable. With an entity, lists the indicators; without one, "
                        + "counts per entity across everything this reader may see.",
                params("entity", "Optional. The entity's name, short name or id")));
        if (Capability.VIEW_PORTFOLIO.grantedTo(who.role())) {
            tools.add(tool("list_portfolio_risk",
                    "Every entity ranked by stored risk score for the review quarter, with its band and "
                            + "its largest signal. Optionally only one band.",
                    params("band", "Optional. CRITICAL, HIGH, MEDIUM or LOW")));
        }
        return tools;
    }

    /* ================================================================== */
    /* dispatch                                                            */
    /* ================================================================== */

    /**
     * Runs one tool call as the caller. Never throws for a refusal or a missing record: the model
     * is told, in the result, that the data is not available, and it says so.
     */
    public Result run(String name, JsonNode args, VukaPrincipal who) {
        try {
            if (who == null) {
                return switch (name) {
                    case "list_published_entities" -> listPublished();
                    case "get_published_entity" -> getPublished(text(args, "entity"));
                    default -> unavailable("That information is only available to signed-in Department and entity staff.");
                };
            }
            return switch (name) {
                case "find_entities" -> find(text(args, "query"), who);
                case "get_entity_overview" -> overview(text(args, "entity"), who);
                case "get_entity_risk" -> risk(text(args, "entity"), who);
                case "list_reporting_status" -> reportingStatus(integer(args, "quarter"), who);
                case "list_figures_without_evidence" -> withoutEvidence(text(args, "entity"), who);
                case "list_portfolio_risk" -> portfolioRisk(text(args, "band"), who);
                default -> unavailable("No such tool.");
            };
        } catch (AccessDeniedException e) {
            // The dashboard's own refusal, reached through the controller proxy.
            return unavailable("This reader's account may not see that.");
        }
    }

    /* ================================================================== */
    /* public                                                              */
    /* ================================================================== */

    private Result listPublished() {
        ArrayNode list = json.createArrayNode();
        for (PublicationService.CitizenView v : publication.publishedEntities()) {
            list.add(citizen(v, false));
        }
        ObjectNode out = json.createObjectNode();
        out.put("note", "Published entities only. Unpublished entities are not visible to the public.");
        out.set("entities", list);
        return new Result(out, List.of(
                new Source("Allocations", ENE),
                new Source("Target outcomes", "Figures confirmed in Vuka by each entity, published by DSAC")));
    }

    private Result getPublished(String query) {
        if (query == null) return unavailable("Name the entity.");
        List<PublicEntity> published = entities.findByPubliclyVisibleTrue();
        Match m = match(query, published);
        if (m.single() == null) return notResolved(m, query);
        PublicationService.CitizenView v = publication.findPublished(m.single().getId());
        if (v == null) return unavailable("No published entity matches '" + query + "'.");
        return new Result(citizen(v, true), List.of(
                new Source(v.name() + ", allocation " + v.financialYearLabel(), ENE),
                new Source(v.name() + ", target outcomes", "Figures confirmed in Vuka, published by DSAC")));
    }

    private ObjectNode citizen(PublicationService.CitizenView v, boolean withMandate) {
        ObjectNode n = json.createObjectNode();
        n.put("name", v.name());
        n.put("sector", v.sector());
        if (withMandate && v.mandate() != null) n.put("mandate", v.mandate());
        n.put("financialYear", v.financialYearLabel());
        money(n, "allocation", v.totalAllocation());
        n.put("allocationSource", ENE);
        n.put("targetOutcomesSource", "figures confirmed in Vuka by the entity and published by DSAC");
        n.put("targetsCommitted", v.targetsCommitted());
        n.put("targetsAchieved", v.targetsAchieved());
        n.put("targetsInProgress", v.targetsInProgress());
        n.put("targetsMissed", v.targetsMissed());
        n.put("targetsNotStarted", v.targetsNotStarted());
        if (v.lastReportedAt() != null) n.put("lastReportedAt", v.lastReportedAt().toString());
        return n;
    }

    /* ================================================================== */
    /* signed in                                                           */
    /* ================================================================== */

    private Result find(String query, VukaPrincipal who) {
        List<PublicEntity> scope = readable(who);
        List<PublicEntity> hits = query == null ? scope : match(query, scope).all();
        ArrayNode list = json.createArrayNode();
        for (PublicEntity e : hits.stream().limit(15).toList()) {
            ObjectNode n = json.createObjectNode();
            n.put("entityId", e.getId().toString());
            n.put("name", e.getName());
            if (e.getShortName() != null) n.put("shortName", e.getShortName());
            n.put("sector", String.valueOf(e.getSector()));
            list.add(n);
        }
        ObjectNode out = json.createObjectNode();
        out.set("entities", list);
        if (hits.isEmpty()) out.put("note", "No entity this reader may see matches that.");
        return new Result(out, List.of());
    }

    private Result overview(String query, VukaPrincipal who) {
        PublicEntity e = resolve(query, who);
        if (e == null) return notFoundFor(query, who);

        ResponseEntity<ReportingViewService.ChainView> r = dashboard.chain(e.getId(), null, who);
        if (!r.getStatusCode().is2xxSuccessful() || r.getBody() == null) return notFoundFor(query, who);
        ReportingViewService.ChainView c = r.getBody();

        ObjectNode n = json.createObjectNode();
        n.put("entity", e.getName());
        money(n, "allocatedThisYear", c.allocated());
        // The citations are in the data, not only in the source list, so the answer can name them
        // in the sentence rather than saying "according to the record".
        if (c.allocatedCitation() != null) n.put("allocationSource", c.allocatedCitation());
        if (c.allocated() == null) n.put("allocationNote", "No allocation row is on record for this year. That is absent, not zero.");
        if (c.promisedCitation() != null) n.put("targetsSource", c.promisedCitation());
        putInt(n, "targetsPromised", c.promisedTargetCount());
        putInt(n, "figuresReported", c.reportedCount());
        putInt(n, "figuresReportedOf", c.reportedOfCount());
        putInt(n, "figuresVerifiedWithEvidence", c.verifiedCount());
        putInt(n, "figuresWithNoEvidence", c.figuresWithNoEvidence());
        putInt(n, "targetsWithNoResult", c.targetsWithNoResult());
        if (c.reportedCitation() != null) n.put("reportingPeriod", c.reportedCitation());
        ArrayNode history = n.putArray("allocationHistory");
        for (ReportingViewService.AllocationView a : c.allocations()) {
            ObjectNode h = json.createObjectNode();
            h.put("financialYear", a.financialYear());
            money(h, "amount", a.amount());
            history.add(h);
        }

        List<Source> sources = new ArrayList<>();
        if (c.allocatedCitation() != null) sources.add(new Source(e.getName() + ", allocation", c.allocatedCitation()));
        if (c.promisedCitation() != null) sources.add(new Source(e.getName() + ", targets", c.promisedCitation()));
        if (c.reportedCitation() != null) sources.add(new Source(e.getName() + ", reported figures", "Vuka submission, " + c.reportedCitation()));
        return new Result(n, sources);
    }

    private Result risk(String query, VukaPrincipal who) {
        PublicEntity e = resolve(query, who);
        if (e == null) return notFoundFor(query, who);

        ResponseEntity<DashboardController.EntityDetail> r = dashboard.entity(e.getId(), null, who);
        if (!r.getStatusCode().is2xxSuccessful() || r.getBody() == null) return notFoundFor(query, who);
        DashboardController.PortfolioRow row = r.getBody().risk();

        ObjectNode n = json.createObjectNode();
        n.put("entity", e.getName());
        String period = periodLabel(views.reviewPeriodId());
        if (period != null) n.put("reviewQuarter", period);
        if (row == null || row.score() == null) {
            n.put("band", "NOT_SCORED");
            n.put("note", "No stored score for the review quarter.");
            return new Result(n, List.of());
        }
        n.put("score", row.score());
        n.put("band", row.band());
        if (row.movement() != null) n.put("movementSinceLastQuarter", row.movement());
        ArrayNode signals = n.putArray("signals");
        for (DashboardController.SignalView s : row.signals()) {
            ObjectNode sn = json.createObjectNode();
            sn.put("type", s.type());
            sn.put("description", s.description());
            if (s.contribution() != null) sn.put("contribution", s.contribution());
            if (s.weight() != null) sn.put("weight", s.weight());
            signals.add(sn);
        }
        n.put("method", "The score is the sum of the stored signal contributions: arithmetic, not a prediction.");
        n.put("source", "Vuka risk engine, stored signals" + (period == null ? "" : " for " + period));
        return new Result(n, List.of(new Source(e.getName() + ", risk score",
                "Vuka risk engine, stored signals" + (period == null ? "" : ", " + period))));
    }

    private Result reportingStatus(Integer quarter, VukaPrincipal who) {
        List<PublicEntity> scope = readable(who);
        if (scope.isEmpty()) return unavailable("This reader's account is not linked to any entity.");

        List<ReportingViewService.PeriodView> periods = views.periodsForCurrentYear();
        ReportingViewService.PeriodView p = null;
        if (quarter != null) {
            p = periods.stream().filter(x -> quarter.equals(x.quarter())).findFirst().orElse(null);
        } else {
            UUID id = Capability.VIEW_PORTFOLIO.grantedTo(who.role()) ? views.reviewPeriodId() : views.currentPeriodId();
            p = id == null ? null : periods.stream().filter(x -> id.equals(x.periodId())).findFirst().orElse(null);
        }
        if (p == null) return unavailable("No such quarter in the current financial year.");

        Map<UUID, ReportingViewService.SubmissionRow> byEntity = new HashMap<>();
        for (ReportingViewService.SubmissionRow s : views.submissionRows(null, p.periodId(), null)) {
            byEntity.put(s.entityId(), s);
        }
        boolean fallenDue = p.daysRemaining() != null && p.daysRemaining() < 0;

        ArrayNode late = json.createArrayNode();
        ArrayNode onTime = json.createArrayNode();
        ArrayNode notYetDue = json.createArrayNode();
        for (PublicEntity e : scope) {
            ReportingViewService.SubmissionRow s = byEntity.get(e.getId());
            boolean submitted = s != null && s.submittedAt() != null;
            ObjectNode n = json.createObjectNode();
            n.put("entity", e.getName());
            if (submitted) {
                n.put("status", s.status());
                if (s.daysLate() != null && s.daysLate() > 0) {
                    n.put("submittedDaysLate", s.daysLate());
                    late.add(n);
                } else {
                    onTime.add(n);
                }
            } else if (fallenDue) {
                n.put("status", s == null ? "NOTHING_FILED" : "DRAFT_NOT_SUBMITTED");
                n.put("daysOverdue", -p.daysRemaining());
                late.add(n);
            } else {
                n.put("status", s == null ? "NOTHING_FILED_YET" : "DRAFT");
                notYetDue.add(n);
            }
        }

        ObjectNode out = json.createObjectNode();
        out.put("source", "Vuka reporting periods and submissions for " + p.label());
        out.put("quarter", p.label());
        out.put("dueDate", p.dueDate());
        out.put("deadlineBasis", p.statutory()
                ? "Statutory: a date set in law under the PFMA"
                : "Departmental instruction, not a statutory date");
        out.put("dueDateHasPassed", fallenDue);
        out.put("entitiesInScope", scope.size());
        out.set("late", late);
        out.set("onTime", onTime);
        if (!notYetDue.isEmpty()) out.set("outstandingNotYetDue", notYetDue);
        return new Result(out, List.of(new Source(p.label() + ", deadline and submissions",
                "Vuka reporting periods and submissions, due " + p.dueDate())));
    }

    private Result withoutEvidence(String query, VukaPrincipal who) {
        UUID period = Capability.VIEW_PORTFOLIO.grantedTo(who.role()) ? views.reviewPeriodId() : views.currentPeriodId();
        if (period == null) return unavailable("No reporting period is open.");
        String label = periodLabel(period);

        if (query != null) {
            PublicEntity e = resolve(query, who);
            if (e == null) return notFoundFor(query, who);
            Submission sub = submissions.findByEntityIdAndReportingPeriodId(e.getId(), period).orElse(null);
            ObjectNode out = json.createObjectNode();
            out.put("entity", e.getName());
            out.put("quarter", label);
            if (sub == null) {
                out.put("note", "Nothing has been filed for this quarter, so there are no reported figures.");
                return new Result(out, List.of());
            }
            ArrayNode list = out.putArray("figuresWithNoEvidence");
            for (ReportingViewService.IndicatorRowView row : views.submissionDetail(sub, null).rows()) {
                if (row.actual() == null || !row.evidence().isEmpty()) continue;
                ObjectNode n = json.createObjectNode();
                n.put("indicatorRef", row.indicatorRef());
                n.put("indicator", row.indicator());
                n.put("reported", row.actual());
                if (row.confirmedByName() != null) n.put("confirmedBy", row.confirmedByName());
                list.add(n);
            }
            return new Result(out, List.of(new Source(e.getName() + ", evidence", "Vuka submission, " + label)));
        }

        ArrayNode list = json.createArrayNode();
        int total = 0;
        for (PublicEntity e : readable(who)) {
            ReportingViewService.ChainView c = views.chainFor(e.getId(), period);
            Integer none = c.figuresWithNoEvidence();
            if (none == null || none == 0) continue;
            ObjectNode n = json.createObjectNode();
            n.put("entity", e.getName());
            n.put("figuresWithNoEvidence", none);
            putInt(n, "figuresReported", c.reportedCount());
            list.add(n);
            total += none;
        }
        ObjectNode out = json.createObjectNode();
        out.put("quarter", label);
        out.put("totalFiguresWithNoEvidence", total);
        out.set("byEntity", list);
        return new Result(out, List.of(new Source("Figures without evidence", "Vuka submissions, " + label)));
    }

    private Result portfolioRisk(String band, VukaPrincipal who) {
        // Through the controller, so VIEW_PORTFOLIO is enforced by the same annotation that guards
        // the screen. A reporter is never offered this tool; this is the second lock.
        List<DashboardController.PortfolioRow> rows = dashboard.portfolio(null);
        String wanted = band == null ? null : band.trim().toUpperCase(Locale.ROOT);
        ArrayNode list = json.createArrayNode();
        for (DashboardController.PortfolioRow r : rows) {
            if (wanted != null && !wanted.equals(r.band())) continue;
            ObjectNode n = json.createObjectNode();
            n.put("entity", r.name());
            n.put("band", r.band());
            if (r.score() != null) n.put("score", r.score());
            if (!r.signals().isEmpty()) n.put("largestSignal", r.signals().get(0).description());
            list.add(n);
        }
        String period = periodLabel(views.reviewPeriodId());
        ObjectNode out = json.createObjectNode();
        if (period != null) out.put("reviewQuarter", period);
        out.set("entities", list);
        return new Result(out, List.of(new Source("Portfolio risk",
                "Vuka risk engine, stored scores" + (period == null ? "" : ", " + period))));
    }

    /* ================================================================== */
    /* scope and matching                                                  */
    /* ================================================================== */

    /** Every entity this caller may read: all of them for the Department, one for a reporter. */
    private List<PublicEntity> readable(VukaPrincipal who) {
        if (Capability.VIEW_PORTFOLIO.grantedTo(who.role())) {
            List<PublicEntity> all = new ArrayList<>();
            entities.findAll().forEach(all::add);
            all.sort(Comparator.comparing(PublicEntity::getName));
            return all;
        }
        if (who.entityId() == null) return List.of();
        try {
            return entities.findById(UUID.fromString(who.entityId())).map(List::of).orElse(List.of());
        } catch (IllegalArgumentException e) {
            return List.of();
        }
    }

    private PublicEntity resolve(String query, VukaPrincipal who) {
        if (query == null) {
            // A reporter asking about "my" figures means their own entity.
            List<PublicEntity> scope = readable(who);
            return scope.size() == 1 ? scope.get(0) : null;
        }
        return match(query, readable(who)).single();
    }

    record Match(List<PublicEntity> all) {
        PublicEntity single() { return all.size() == 1 ? all.get(0) : null; }
    }

    /** An id, then an exact name or short name, then a name containing every word asked for. */
    static Match match(String query, List<PublicEntity> scope) {
        String q = query.trim().toLowerCase(Locale.ROOT);
        for (PublicEntity e : scope) {
            if (e.getId().toString().equals(q)) return new Match(List.of(e));
        }
        List<PublicEntity> exact = scope.stream()
                .filter(e -> q.equals(lower(e.getName())) || q.equals(lower(e.getShortName())))
                .toList();
        if (!exact.isEmpty()) return new Match(exact);

        String[] words = q.replaceAll("[^\\p{L}\\p{N} ]", " ").trim().split("\\s+");
        List<PublicEntity> partial = scope.stream()
                .filter(e -> {
                    String hay = lower(e.getName()) + " " + lower(e.getShortName());
                    return Arrays.stream(words).allMatch(hay::contains);
                })
                .toList();
        return new Match(partial);
    }

    private static String lower(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT); }

    private Result notResolved(Match m, String query) {
        if (m.all().isEmpty()) return unavailable("No published entity matches '" + query + "'.");
        ObjectNode out = json.createObjectNode();
        out.put("note", "More than one entity matches '" + query + "'. Ask which one is meant.");
        ArrayNode names = out.putArray("candidates");
        m.all().stream().limit(8).forEach(e -> names.add(e.getName()));
        return new Result(out, List.of());
    }

    private Result notFoundFor(String query, VukaPrincipal who) {
        if (query != null) {
            Match m = match(query, readable(who));
            if (m.all().size() > 1) return notResolved(m, query);
        }
        // The same answer for "does not exist" and "not yours", as the API gives, because saying a
        // record exists but is not the caller's is itself a disclosure about another entity.
        return unavailable("No entity this reader may see matches '" + (query == null ? "" : query) + "'.");
    }

    /* ================================================================== */
    /* small things                                                        */
    /* ================================================================== */

    private Result unavailable(String why) {
        ObjectNode out = json.createObjectNode();
        out.put("unavailable", why);
        return new Result(out, List.of());
    }

    private String periodLabel(UUID periodId) {
        if (periodId == null) return null;
        return views.periodsForCurrentYear().stream()
                .filter(p -> p.periodId().equals(periodId))
                .map(ReportingViewService.PeriodView::label)
                .findFirst().orElse(null);
    }

    /** Rands as a number and as the words a reader expects, so the model need not do arithmetic. */
    private static void money(ObjectNode n, String field, BigDecimal rands) {
        if (rands == null) {
            n.putNull(field);
            return;
        }
        n.put(field + "Rands", rands);
        n.put(field + "Text", randsText(rands));
    }

    static String randsText(BigDecimal rands) {
        BigDecimal abs = rands.abs();
        if (abs.compareTo(BigDecimal.valueOf(1_000_000_000)) >= 0) {
            return "R" + abs.divide(BigDecimal.valueOf(1_000_000_000), 2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + " billion";
        }
        if (abs.compareTo(BigDecimal.valueOf(1_000_000)) >= 0) {
            return "R" + abs.divide(BigDecimal.valueOf(1_000_000), 1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + " million";
        }
        return "R" + String.format(Locale.ROOT, "%,.0f", abs).replace(',', ' ');
    }

    private static void putInt(ObjectNode n, String field, Integer value) {
        if (value == null) n.putNull(field); else n.put(field, value);
    }

    private static String text(JsonNode args, String field) {
        JsonNode v = args == null ? null : args.get(field);
        if (v == null || v.isNull()) return null;
        String s = v.asText().trim();
        return s.isEmpty() ? null : s.substring(0, Math.min(200, s.length()));
    }

    private static Integer integer(JsonNode args, String field) {
        JsonNode v = args == null ? null : args.get(field);
        if (v == null || v.isNull()) return null;
        if (v.isInt()) return v.asInt();
        try {
            return Integer.valueOf(v.asText().replaceAll("[^0-9]", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private ObjectNode tool(String name, String description, ObjectNode parameters) {
        ObjectNode t = json.createObjectNode();
        t.put("type", "function");
        ObjectNode f = t.putObject("function");
        f.put("name", name);
        f.put("description", description);
        f.set("parameters", parameters);
        return t;
    }

    /** A parameters schema of optional strings, given as name and description pairs. */
    private ObjectNode params(String... nameAndDescription) {
        ObjectNode p = json.createObjectNode();
        p.put("type", "object");
        ObjectNode props = p.putObject("properties");
        for (int i = 0; i + 1 < nameAndDescription.length; i += 2) {
            ObjectNode prop = props.putObject(nameAndDescription[i]);
            prop.put("type", "string");
            prop.put("description", nameAndDescription[i + 1]);
        }
        p.put("additionalProperties", false);
        return p;
    }
}
