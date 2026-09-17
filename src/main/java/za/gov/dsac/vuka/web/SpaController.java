package za.gov.dsac.vuka.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the office dashboard's shell for its own client side routes.
 *
 * <h2>Why this is needed</h2>
 *
 * The dashboard carries its routes in the URL rather than in a fragment, so a reviewer can send a
 * colleague a link to one submission and a Director-General can bookmark the portfolio. The server
 * has no page for {@code /review/abc123}: the router in the browser does. Without this forward,
 * reloading that URL returns a 404 from the static handler, and "it works until you refresh" is
 * the single most common way a single page application embarrasses itself in a live demo.
 *
 * <h2>What it deliberately does not forward</h2>
 *
 * Only the dashboard's own route prefixes are listed, one at a time. A catch all forward would
 * swallow {@code /api} typos and the Thymeleaf surfaces, turning a wrong URL into a blank React
 * page instead of an honest 404, and it would hide a mistyped API path behind an HTML response
 * that a fetch client cannot read.
 *
 * <p>Forwarding is not authorisation. Every one of these paths returns the same shell to anybody,
 * and the shell has no data in it: it asks {@code /api/me} who is calling and renders a sign in
 * form until something answers. Access control lives on the API and on
 * {@link za.gov.dsac.vuka.config.FirebaseTokenFilter}, not here.
 *
 * <p>Present but inert until {@code mvn package} has run with the frontend built into
 * {@code src/main/resources/static}. With no bundle there this forwards to a file that does not
 * exist, which is a 404 on the shell and not on anything else.
 */
@Controller
public class SpaController {

    private static final String SHELL = "forward:/index.html";

    @GetMapping({"/signin", "/entity", "/review", "/portfolio"})
    public String shell() {
        return SHELL;
    }

    @GetMapping({"/entity/**", "/review/**", "/portfolio/**", "/admin/entities/**"})
    public String nested() {
        return SHELL;
    }
}
