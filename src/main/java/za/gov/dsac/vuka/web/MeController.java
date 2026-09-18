package za.gov.dsac.vuka.web;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import za.gov.dsac.vuka.config.Capability;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.domain.PublicEntity;
import za.gov.dsac.vuka.repository.PublicEntityRepository;
import za.gov.dsac.vuka.service.ReportingViewService;
import za.gov.dsac.vuka.service.WorkspaceService;

import java.util.List;
import java.util.UUID;

/**
 * Who is calling, and what reporting periods exist.
 *
 * <h2>Why the client does not read its own token</h2>
 *
 * A Firebase ID token is readable in the browser, so the frontend could pull role and entityId out
 * of it without asking. It does not, for two reasons. The claims on the token are a uid and an
 * entity id, and what a reporter needs on screen is the entity's <em>name</em>, which only the
 * database holds. And a round trip here is the frontend's first proof that the backend accepted
 * the token at all, which turns "the dashboard is empty" into "your account carries no role claim"
 * at the one moment that distinction is cheap to act on.
 *
 * <p>Nothing here grants anything. The entity on the response is the entity on the signed token,
 * and every other controller checks it again through {@link VukaPrincipal#canRead}.
 */
@RestController
@RequestMapping("/api")
public class MeController {

    private final PublicEntityRepository entities;
    private final ReportingViewService views;
    private final WorkspaceService workspace;

    public MeController(PublicEntityRepository entities, ReportingViewService views,
                        WorkspaceService workspace) {
        this.entities = entities;
        this.views = views;
        this.workspace = workspace;
    }

    /**
     * @param capabilities what this person may do, from {@link Capability}. The dashboard shows
     *                     an action only when its capability is here, so the screen and the API
     *                     cannot disagree about what a role is allowed to do.
     */
    public record MeView(String uid, String email, String name, String role,
                         String entityId, String entityName, List<String> capabilities) {}

    @GetMapping("/me")
    public MeView me(@AuthenticationPrincipal VukaPrincipal who) {
        // Whoever signs in becomes someone work can be assigned to. See WorkspaceService.
        workspace.recordSignIn(who);
        String entityName = null;
        if (who.entityId() != null) {
            try {
                PublicEntity e = entities.findById(UUID.fromString(who.entityId())).orElse(null);
                if (e != null) entityName = e.getName();
            } catch (IllegalArgumentException ignored) {
                // An entityId claim that is not a uuid is an administration error rather than an
                // attack. The name stays absent and the reporter screens say what is wrong.
            }
        }
        return new MeView(who.uid(), who.email(), who.name(), who.role(), who.entityId(), entityName,
                Capability.of(who.role()).stream().map(Enum::name).toList());
    }

    /**
     * Every period of the current financial year, with its due date and the instrument behind it.
     *
     * <p>Open to every authenticated role. A period is a published departmental calendar rather
     * than anybody's data, and a reporter who cannot see their own deadline is the failure this
     * product exists to fix.
     */
    @GetMapping("/periods")
    public List<ReportingViewService.PeriodView> periods() {
        return views.periodsForCurrentYear();
    }
}
