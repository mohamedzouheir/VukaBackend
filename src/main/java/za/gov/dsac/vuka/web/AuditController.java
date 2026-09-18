package za.gov.dsac.vuka.web;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.service.AuditTrailService;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The audit trail.
 *
 * <h2>Who sees what</h2>
 *
 * A DSAC role sees the whole trail, because they can already read every entity's reporting and a
 * trail they could not see would be a trail they could not act on. A reporter sees their own
 * entity and nothing else, and that scoping is applied here from the token rather than from a
 * parameter, exactly as it is everywhere else in this API: {@code entityId} on a request from a
 * reporter is ignored in favour of the one on their signed token.
 *
 * <h2>The export</h2>
 *
 * A date range and a CSV, because the reason somebody wants this is almost always to give it to
 * a third party: an internal auditor, the Auditor-General's team, or a portfolio committee. The
 * file carries its own filter in the header, so a spreadsheet that has been emailed on still says
 * what it covers and who drew it. A CSV extract with no statement of its range is the kind of
 * evidence that gets challenged.
 */
@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private static final ZoneId ZA = ZoneId.of("Africa/Johannesburg");
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZA);

    private final AuditTrailService audit;

    public AuditController(AuditTrailService audit) {
        this.audit = audit;
    }

    public record AuditRow(String at, String type, String actor, String entity,
                           String summary, String detail, UUID entityId, UUID recordId) {}

    public record AuditPage(List<AuditRow> events, List<String> types, boolean scopedToOwnEntity,
                            String note) {}

    /**
     * The trail, newest first.
     *
     * <p>Capped rather than paged. The screen is a filter over a range, not an infinite scroll,
     * and a reader who has hit the cap wants a narrower range rather than a second page.
     */
    @GetMapping
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public AuditPage trail(
            @RequestParam(name = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "entityId", required = false) UUID entityId,
            @RequestParam(name = "type", required = false) String type,
            @RequestParam(name = "limit", required = false, defaultValue = "500") int limit,
            @AuthenticationPrincipal VukaPrincipal who) {

        UUID scope = scopeFor(who, entityId);
        boolean scoped = who != null && !who.isDsac();

        List<AuditRow> rows = audit.trail(scope, from, to, type, limit).stream()
                .map(e -> new AuditRow(STAMP.format(e.at()), e.type(), e.actor(), e.entity(),
                        e.summary(), e.detail(), e.entityId(), e.recordId()))
                .toList();

        return new AuditPage(rows, AuditTrailService.TYPES, scoped,
                scoped
                        ? "Scoped to your own entity. The entity comes from your signed token rather than from this request."
                        : "Every entity. Times are South African Standard Time.");
    }

    /**
     * The same trail as a CSV.
     *
     * <p>Same scoping, same filters, no cap: an export that silently stopped at five hundred rows
     * would be worse than no export, because the person reading it would not know.
     */
    @GetMapping("/export.csv")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public ResponseEntity<byte[]> export(
            @RequestParam(name = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(name = "entityId", required = false) UUID entityId,
            @RequestParam(name = "type", required = false) String type,
            @AuthenticationPrincipal VukaPrincipal who) {

        UUID scope = scopeFor(who, entityId);

        StringBuilder csv = new StringBuilder();
        csv.append("timestamp,type,actor,entity,summary,detail,record_id\n");

        List<AuditTrailService.AuditEvent> events =
                audit.trail(scope, from, to, type, Integer.MAX_VALUE);

        for (AuditTrailService.AuditEvent e : events) {
            csv.append(q(STAMP.format(e.at()))).append(',')
               .append(q(e.type())).append(',')
               .append(q(e.actor())).append(',')
               .append(q(e.entity())).append(',')
               .append(q(e.summary())).append(',')
               .append(q(e.detail())).append(',')
               .append(q(e.recordId())).append('\n');
        }

        // The filter travels with the file. A CSV that has been emailed on still has to say what
        // it covers, or it cannot be relied on by whoever ends up holding it.
        csv.append('\n');
        csv.append("# Vuka audit trail\n");
        csv.append("# Range: ").append(from == null ? "from the beginning" : from)
           .append(" to ").append(to == null ? "now" : to).append('\n');
        csv.append("# Scope: ").append(scope == null ? "every entity" : "one entity, " + scope).append('\n');
        csv.append("# Type: ").append(type == null || type.isBlank() ? "all types" : type).append('\n');
        csv.append("# Rows: ").append(events.size()).append('\n');
        csv.append("# Drawn by: ").append(who == null ? "unknown" : who.email()).append('\n');
        csv.append("# Drawn at: ").append(STAMP.format(java.time.Instant.now())).append(" South African Standard Time\n");
        csv.append("# This is the accountability record, assembled from the rows it describes. ")
           .append("It is not the application log.\n");

        String name = "vuka-audit_"
                + (from == null ? "start" : from) + "_to_" + (to == null ? LocalDate.now(ZA) : to)
                + ".csv";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + name)
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    /** What this build does not expose, and why, so the question has an answer on the record. */
    @GetMapping("/about")
    @PreAuthorize("@can.has('READ_OWN_REPORTING')")
    public Map<String, Object> about() {
        return Map.of(
                "what", "Who did what, to which figure, and when.",
                "source", "Assembled from the records themselves rather than from a separate event "
                        + "table, so the trail and the data it describes cannot disagree.",
                "notIncluded", "The application log. Server diagnostics carry stack traces and "
                        + "internal paths, are written for whoever operates the service, and are "
                        + "not an accountability record.",
                "timezone", "Africa/Johannesburg");
    }

    /**
     * The tenancy check, in one place.
     *
     * <p>A reporter is pinned to the entity on their token whatever they asked for. A DSAC role
     * may narrow to one entity or see them all.
     */
    private static UUID scopeFor(VukaPrincipal who, UUID requested) {
        if (who == null) return requested;
        if (who.isDsac()) return requested;
        return who.entityId() == null ? null : UUID.fromString(who.entityId());
    }

    /** CSV quoting. Narrative fields here are free text and full of commas and quotes. */
    private static String q(Object v) {
        if (v == null) return "";
        String s = String.valueOf(v);
        if (s.indexOf(',') < 0 && s.indexOf('"') < 0 && s.indexOf('\n') < 0 && s.indexOf('\r') < 0) {
            return s;
        }
        return '"' + s.replace("\"", "\"\"") + '"';
    }
}
