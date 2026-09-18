package za.gov.dsac.vuka.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.Enums;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.domain.ReportingPeriod;
import za.gov.dsac.vuka.repository.PublicEntityRepository;
import za.gov.dsac.vuka.repository.ReportingPeriodRepository;
import za.gov.dsac.vuka.service.ReporterAccountService;
import za.gov.dsac.vuka.service.ReportingViewService;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Administration: who reports, by when, and what the public sees.
 *
 * <h2>What an administrator does here</h2>
 *
 * <ul>
 *   <li><b>Registers an entity.</b> Name, sector and PFMA schedule. Targets are not entered here:
 *       a target may only change where the Annual Performance Plan was revised and re-tabled,
 *       under section 4.4.4 of the 2019 Revised Framework, so they are loaded from the tabled plan
 *       and versioned rather than typed into a form.</li>
 *   <li><b>Issues reporter accounts.</b> There is no sign up. A reporter's authority is the entity
 *       on their token, so it is granted by DSAC for one named entity, and the person can only
 *       sign in. See {@link ReporterAccountService}.</li>
 *   <li><b>Sets the submission deadline</b> for a quarter. For a Schedule 3A entity TR 30.2.1
 *       names no day count, so the date is the Department's instruction, and this is where it is
 *       given. The reporter's countdown, the reminders and the lateness signal all read it.</li>
 *   <li><b>Publishes to the citizen view</b> (UC-21). A switch, not a project.</li>
 * </ul>
 *
 * The administrator does not review. Approving figures is the reviewer's, so publication and
 * approval always take two people. See {@code Capability}.
 */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("@can.has('ADMINISTER')")
public class AdminController {

    /**
     * Every administrative action is logged with the actor on it.
     *
     * <p>An administrator decides who reports, by when, and what the public sees, and every one of
     * those decisions is attributable. The one thing barred is review, so that publication and
     * approval always take two people.
     */
    private static final Logger audit = LoggerFactory.getLogger("za.gov.dsac.vuka.audit");

    private static final ZoneId ZA = ZoneId.of("Africa/Johannesburg");

    private final PublicEntityRepository entities;
    private final ReportingPeriodRepository periods;
    private final ReportingViewService views;
    private final ReporterAccountService accounts;

    public AdminController(PublicEntityRepository entities, ReportingPeriodRepository periods,
                           ReportingViewService views, ReporterAccountService accounts) {
        this.entities = entities;
        this.periods = periods;
        this.views = views;
        this.accounts = accounts;
    }

    private static ResponseEntity<Map<String, String>> refuse(int status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }

    private static String actor(VukaPrincipal who) {
        return who == null ? "unknown" : who.email() + " uid=" + who.uid();
    }

    /* ------------------------------------------------------------------ */
    /* Entities and their reporters                                        */
    /* ------------------------------------------------------------------ */

    public record NewEntity(String name, String shortName, Enums.Sector sector,
                            Enums.PfmaSchedule pfmaSchedule, String contactName, String contactEmail) {}

    /**
     * Registers a funded body. It starts unpublished, with no targets and no reporter, and appears
     * in the review queue at once, ranked with nothing filed, which is the correct first state.
     */
    @PostMapping("/entities")
    @Transactional
    public ResponseEntity<?> createEntity(@RequestBody NewEntity req,
                                          @AuthenticationPrincipal VukaPrincipal who) {
        String name = req.name() == null ? "" : req.name().trim();
        String shortName = req.shortName() == null ? "" : req.shortName().trim();
        if (name.isEmpty() || shortName.isEmpty()) return refuse(400, "A name and a short name are both required.");
        if (req.sector() == null) return refuse(400, "Choose a sector. It decides which peers unit cost may be compared with.");

        boolean taken = entities.findAll().stream().anyMatch(e ->
                name.equalsIgnoreCase(e.getName()) || shortName.equalsIgnoreCase(e.getShortName()));
        if (taken) return refuse(409, "An entity with that name or short name is already registered.");

        PublicEntity e = new PublicEntity();
        e.setName(name);
        e.setShortName(shortName);
        e.setSector(req.sector());
        e.setEntityType(Enums.EntityType.PUBLIC_ENTITY);
        e.setPfmaSchedule(req.pfmaSchedule() == null ? Enums.PfmaSchedule.SCHEDULE_3A : req.pfmaSchedule());
        e.setContactName(blankToNull(req.contactName()));
        e.setContactEmail(blankToNull(req.contactEmail()));
        e.setPubliclyVisible(false);
        entities.save(e);

        audit.info("entity_created entity={} name=\"{}\" sector={} schedule={} actor={} at={}",
                e.getId(), name, e.getSector(), e.getPfmaSchedule(), actor(who), Instant.now());

        return ResponseEntity.ok(Map.of("entityId", e.getId(), "name", e.getName()));
    }

    public record NewReporter(String name, String email) {}

    /** Issues a reporter account for one entity. The only way a reporter account comes to exist. */
    @PostMapping("/entities/{entityId}/reporters")
    public ResponseEntity<?> issueReporter(@PathVariable("entityId") UUID entityId,
                                           @RequestBody NewReporter req,
                                           @AuthenticationPrincipal VukaPrincipal who) {
        PublicEntity e = entities.findById(entityId).orElse(null);
        if (e == null) return ResponseEntity.notFound().build();
        String email = req.email() == null ? "" : req.email().trim();
        String name = req.name() == null ? "" : req.name().trim();
        if (name.isEmpty() || !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            return refuse(400, "A name and a valid email address are both required.");
        }
        try {
            ReporterAccountService.Issued issued = accounts.issue(e, email, name);
            audit.info("reporter_issued entity={} email={} credential={} actor={} at={}",
                    entityId, issued.email(), issued.credentialIssued(), actor(who), Instant.now());
            return ResponseEntity.ok(issued);
        } catch (IllegalStateException ex) {
            return refuse(409, ex.getMessage());
        }
    }

    /* ------------------------------------------------------------------ */
    /* Deadlines                                                           */
    /* ------------------------------------------------------------------ */

    @GetMapping("/periods")
    public List<ReportingViewService.PeriodView> periods() {
        return views.periodsForCurrentYear();
    }

    public record DueDateRequest(LocalDate dueDate) {}

    /**
     * Sets the submission deadline for a quarter, for every entity.
     *
     * <p>Three refusals, each protecting something:
     * <ul>
     *   <li>A deadline that has already passed cannot be moved. Lateness was measured against it,
     *       and moving it afterwards would quietly rewrite who was late.</li>
     *   <li>The new date cannot be in the past, for the same reason.</li>
     *   <li>It cannot fall before the quarter ends, because nobody can report a quarter that has
     *       not finished.</li>
     * </ul>
     * Where a statutory deadline applies, the instruction may not be later than the law.
     */
    @PostMapping("/periods/{periodId}/due-date")
    @Transactional
    public ResponseEntity<?> setDueDate(@PathVariable("periodId") UUID periodId,
                                        @RequestBody DueDateRequest req,
                                        @AuthenticationPrincipal VukaPrincipal who) {
        ReportingPeriod p = periods.findById(periodId).orElse(null);
        if (p == null) return ResponseEntity.notFound().build();
        if (req.dueDate() == null) return refuse(400, "Choose a date.");

        LocalDate today = LocalDate.now(ZA);
        LocalDate before = p.getSubmissionDueDate();
        if (before != null && before.isBefore(today)) {
            return refuse(409, p.getLabel() + " fell due on " + before + ". A deadline that has passed "
                    + "cannot be moved, because lateness has already been measured against it.");
        }
        if (req.dueDate().isBefore(today)) {
            return refuse(400, "The deadline cannot be in the past.");
        }
        if (p.getPeriodEnd() != null && req.dueDate().isBefore(p.getPeriodEnd())) {
            return refuse(400, p.getLabel() + " ends on " + p.getPeriodEnd()
                    + ". The deadline cannot fall before the quarter has finished.");
        }
        if (p.getRegulatoryDeadline() != null && req.dueDate().isAfter(p.getRegulatoryDeadline())) {
            return refuse(400, "The statutory deadline for " + p.getLabel() + " is "
                    + p.getRegulatoryDeadline() + ". A departmental instruction cannot be later than the law.");
        }

        p.setSubmissionDueDate(req.dueDate());
        periods.save(p);

        audit.info("deadline_set period={} label=\"{}\" from={} to={} actor={} at={}",
                periodId, p.getLabel(), before, req.dueDate(), actor(who), Instant.now());

        return ResponseEntity.ok(views.toPeriodView(p));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** The entity register, with target counts and publication state. */
    @GetMapping("/entities")
    public List<ReportingViewService.AdminEntityRow> entities() {
        return views.adminEntityRows();
    }

    public record PublicationRequest(boolean publiclyVisible) {}

    public record PublicationResponse(UUID entityId, boolean publiclyVisible, String note) {}

    /**
     * UC-21. Publish an entity to the citizen view, or withdraw it.
     *
     * <p>A switch, not a project. The decision is the department's and this endpoint records that
     * it was made, by whom and when.
     */
    @PostMapping("/entities/{entityId}/publication")
    @Transactional
    public ResponseEntity<PublicationResponse> setPublication(
            @PathVariable("entityId") UUID entityId,
            @RequestBody PublicationRequest req,
            @AuthenticationPrincipal VukaPrincipal who) {

        PublicEntity e = entities.findById(entityId).orElse(null);
        if (e == null) return ResponseEntity.notFound().build();

        boolean before = e.isPubliclyVisible();
        e.setPubliclyVisible(req.publiclyVisible());
        entities.save(e);

        audit.info("publication_changed entity={} name=\"{}\" from={} to={} actor={} uid={} at={}",
                entityId, e.getName(), before, req.publiclyVisible(),
                who == null ? "unknown" : who.email(),
                who == null ? "unknown" : who.uid(),
                Instant.now());

        String note = req.publiclyVisible()
                ? "Published. The citizen view now shows this entity's allocation, its targets, "
                  + "what it reported and whether that was verified, each with the published source "
                  + "it came from. No risk score is published: the score is an internal "
                  + "prioritisation aid with weights the department chose."
                : "Withdrawn. This entity no longer appears on the citizen view.";

        return ResponseEntity.ok(new PublicationResponse(entityId, e.isPubliclyVisible(), note));
    }
}
