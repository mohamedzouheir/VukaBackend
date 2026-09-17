package za.gov.dsac.vuka.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.repository.PublicEntityRepository;
import za.gov.dsac.vuka.service.ReportingViewService;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Administration.
 *
 * <h2>Why publication is the only thing here</h2>
 *
 * UC-21, and it is the one administrative action the product cannot do without. Nothing reaches
 * the citizen view unless {@code publiclyVisible} is set on the entity, and every seeded entity
 * ships with it false, so the department turns the public surface on rather than discovering it is
 * already on. The system makes publication a switch rather than a project, and does not make the
 * call on the department's behalf.
 *
 * <p>What is deliberately absent: a form that creates entities, and a form that registers or edits
 * targets. A target may only change where the Annual Performance Plan was revised and re-tabled,
 * under section 4.4.4 of the 2019 Revised Framework, so a control that edits one in place would be
 * an action the law does not permit. Targets are versioned rather than mutable and they are loaded
 * from a tabled plan, which is a data loading task rather than a screen.
 *
 * <p>Reporter accounts are issued by setting the {@code role} and {@code entityId} custom claims
 * through the Firebase Admin SDK. That is a script, and section 12 of the frontend design cuts the
 * user administration screen first for exactly that reason.
 */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    /**
     * Every administrative action is logged with the actor on it.
     *
     * <p>Nothing is fully barred to an administrator, which is precisely why the trail matters:
     * the control on this role is that its actions are attributable, not that they are restricted.
     */
    private static final Logger audit = LoggerFactory.getLogger("za.gov.dsac.vuka.audit");

    private final PublicEntityRepository entities;
    private final ReportingViewService views;

    public AdminController(PublicEntityRepository entities, ReportingViewService views) {
        this.entities = entities;
        this.views = views;
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
            @PathVariable UUID entityId,
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
