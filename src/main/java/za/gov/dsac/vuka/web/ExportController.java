package za.gov.dsac.vuka.web;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.Submission;
import za.gov.dsac.vuka.repository.SubmissionRepository;
import za.gov.dsac.vuka.service.ExportService;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * Getting a confirmed filing out of Vuka and into whatever the department reports through.
 *
 * <h2>The positioning this endpoint encodes</h2>
 *
 * DPME already runs eQPRS for quarterly performance reporting and is extending it to national
 * public entities. Competing with it on capture would be a losing argument in front of anyone
 * who knows the landscape. So this system holds the part nobody else holds, which is the
 * evidence behind each figure and the trail from figure to source cell to named confirmer, and
 * then hands the figures on.
 *
 * <p>Three formats, because there are three audiences and they want different things.
 * {@code /json} is the full record including provenance. {@code /eqprs.csv} is the flattened
 * shape for DPME. {@code /treasury.csv} is the quarterly line Treasury asks for by email under
 * Treasury Regulation 26.1.1, which is financial and therefore mostly not this system's data.
 *
 * <h2>Who may export</h2>
 *
 * A reporter may export their own entity's filing, and the check is against the {@code entityId}
 * on the signed token rather than anything in the path. DSAC roles may export any of them. There
 * is no unauthenticated export: the citizen view is a separate, narrower surface, and publishing
 * is a departmental decision made per entity rather than a side effect of having a link.
 */
@RestController
@RequestMapping("/api/export")
public class ExportController {

    private final SubmissionRepository submissions;
    private final ExportService exportService;

    public ExportController(SubmissionRepository submissions, ExportService exportService) {
        this.submissions = submissions;
        this.exportService = exportService;
    }

    /** The full record, provenance included. This is the one an auditor would want. */
    @GetMapping("/submission/{submissionId}/json")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public ExportService.QuarterlyExport json(@PathVariable("submissionId") UUID submissionId,
                                              @AuthenticationPrincipal VukaPrincipal principal) {
        return exportService.build(authorised(submissionId, principal));
    }

    /**
     * The DPME shape, as a file a person can upload or a script can post.
     *
     * <p>Lossy on purpose. The source cell and the evidence count have nowhere to go in this
     * shape, which is precisely why the department should keep this system as the record and
     * treat eQPRS as a destination.
     */
    @GetMapping("/submission/{submissionId}/eqprs.csv")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public ResponseEntity<byte[]> eqprs(@PathVariable("submissionId") UUID submissionId,
                                        @AuthenticationPrincipal VukaPrincipal principal) {
        Submission s = authorised(submissionId, principal);
        ExportService.QuarterlyExport export = exportService.build(s);
        List<ExportService.EqprsLine> lines = exportService.toEqprsShape(export);

        StringBuilder csv = new StringBuilder();
        csv.append("indicator_code,indicator_description,annual_target,quarterly_target,")
           .append("actual_output,deviation_reason,corrective_action\n");
        for (ExportService.EqprsLine l : lines) {
            csv.append(q(l.indicatorCode())).append(',')
               .append(q(l.indicatorDescription())).append(',')
               .append(q(l.annualTarget())).append(',')
               .append(q(l.quarterlyTarget())).append(',')
               .append(q(l.actualOutput())).append(',')
               .append(q(l.deviationReason())).append(',')
               .append(q(l.correctiveAction())).append('\n');
        }
        return file(csv.toString(), fileName(export, "eqprs") + ".csv");
    }

    /**
     * The full record as a spreadsheet, for the reviewer who wants it on a screen rather than
     * in a parser. Carries the provenance columns the eQPRS shape has to drop.
     */
    @GetMapping("/submission/{submissionId}/full.csv")
    @PreAuthorize("hasAnyRole('ENTITY_REPORTER','DSAC_REVIEWER','DSAC_EXECUTIVE','ADMIN')")
    public ResponseEntity<byte[]> full(@PathVariable("submissionId") UUID submissionId,
                                       @AuthenticationPrincipal VukaPrincipal principal) {
        ExportService.QuarterlyExport e = exportService.build(authorised(submissionId, principal));

        StringBuilder csv = new StringBuilder();
        csv.append("indicator_ref,indicator,unit,annual_target,quarter_target,actual,variance,")
           .append("status,source_cell,evidence_count,agsa_criteria,traceable,")
           .append("confirmed_by,confirmed_at,target_version,revision_trigger,retabling_reference,")
           .append("variance_explanation\n");

        for (ExportService.IndicatorLine l : e.indicators()) {
            csv.append(q(l.indicatorRef())).append(',')
               .append(q(l.indicator())).append(',')
               .append(q(l.unitOfMeasure())).append(',')
               .append(q(l.annualTarget())).append(',')
               .append(q(l.quarterTarget())).append(',')
               .append(q(l.actual())).append(',')
               .append(q(l.variance())).append(',')
               .append(q(l.status())).append(',')
               .append(q(l.sourceLocation())).append(',')
               .append(l.evidenceCount()).append(',')
               .append(q(String.join(" ", l.evidenceCriteria()))).append(',')
               .append(l.traceable()).append(',')
               .append(q(l.confirmedByName())).append(',')
               .append(q(l.confirmedAt())).append(',')
               .append(l.targetVersion()).append(',')
               .append(q(l.targetRevisionTrigger())).append(',')
               .append(q(l.targetRetablingReference())).append(',')
               .append(q(l.varianceExplanation())).append('\n');
        }

        // The caveats travel with the file. An export that sheds its limitations on the way out
        // is how a qualified figure ends up in a briefing note as a fact.
        csv.append('\n');
        for (String c : e.caveats()) csv.append("# ").append(c).append('\n');
        csv.append("# Schema ").append(e.schemaVersion())
           .append(", generated ").append(e.generatedAt()).append('\n');
        csv.append("# Reporting line: ").append(e.entity().reportingLine()).append('\n');

        return file(csv.toString(), fileName(e, "full") + ".csv");
    }

    // ------------------------------------------------------------------

    /**
     * The tenancy check, in one place.
     *
     * <p>A reporter's entity comes off the token. Comparing it to the submission's entity is the
     * whole of the isolation model, and doing it here rather than in a filter means a new export
     * format cannot accidentally ship without it.
     */
    private Submission authorised(UUID submissionId, VukaPrincipal principal) {
        Submission s = submissions.findById(submissionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such submission"));

        // canRead is the same check every other controller uses, and entityId on the token is a
        // String, so the comparison goes through the helper rather than being retyped here.
        if (principal != null && !principal.canRead(s.getEntity().getId().toString())) {
            // Not FORBIDDEN. Telling a caller that a submission exists but is not theirs is itself
            // a disclosure about another entity's reporting.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such submission");
        }
        return s;
    }

    private static String fileName(ExportService.QuarterlyExport e, String kind) {
        String entity = e.entity().shortName() == null ? "entity" : e.entity().shortName();
        String period = e.period().label() == null ? "period" : e.period().label().replace(' ', '-').replace('/', '-');
        return entity + "_" + period + "_" + kind;
    }

    private static ResponseEntity<byte[]> file(String body, String name) {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }

    /** CSV quoting. Government data is full of commas, quotes and newlines inside narrative fields. */
    private static String q(Object v) {
        if (v == null) return "";
        String s = String.valueOf(v);
        if (s.indexOf(',') < 0 && s.indexOf('"') < 0 && s.indexOf('\n') < 0 && s.indexOf('\r') < 0) {
            return s;
        }
        return '"' + s.replace("\"", "\"\"").replace("\r\n", " ").replace('\n', ' ').replace('\r', ' ') + '"';
    }
}
