package za.gov.dsac.vuka.web;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;
import za.gov.dsac.vuka.config.VukaPrincipal;

/**
 * The page a signed-in person sees when they open part of the phone surface their role does not
 * use. Reached by forward from {@code AccessResponses}, never linked to.
 *
 * <p>It says three things: who they are signed in as, that this surface is for entity reporters,
 * and where their own work is. It does not say what is behind the link, because the link may name
 * another entity's submission.
 */
@Controller
public class AccessController {

    @RequestMapping("/access/denied")
    public String denied(@AuthenticationPrincipal VukaPrincipal who, Model model) {
        model.addAttribute("roleLabel", who == null ? null : who.roleLabel());
        model.addAttribute("name", who == null ? null : who.name());
        model.addAttribute("dsac", who != null && who.isDsac());
        return "access-denied";
    }
}
