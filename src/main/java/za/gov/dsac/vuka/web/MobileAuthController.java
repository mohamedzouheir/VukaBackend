package za.gov.dsac.vuka.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import za.gov.dsac.vuka.config.AuthCookie;
import za.gov.dsac.vuka.service.PasswordSignInService;

import java.util.Optional;

/**
 * Sign in and out of the server-rendered reporter surface.
 *
 * One email field, one password field, no JavaScript. The server exchanges them for a Firebase
 * ID token and puts it in {@link AuthCookie}. Everything about why it works this way rather than
 * through the Firebase client SDK is on {@link PasswordSignInService}.
 */
@Controller
@RequestMapping("/m")
public class MobileAuthController {

    private final PasswordSignInService signIn;

    public MobileAuthController(PasswordSignInService signIn) {
        this.signIn = signIn;
    }

    @GetMapping("/signin")
    public String form(@RequestParam(name = "next", required = false) String next, Model model) {
        model.addAttribute("next", safeNext(next));
        return "mobile-signin";
    }

    @PostMapping("/signin")
    public String submit(@RequestParam("email") String email,
                         @RequestParam("password") String password,
                         @RequestParam(name = "next", required = false) String next,
                         HttpServletRequest request,
                         HttpServletResponse response,
                         Model model) {

        String target = safeNext(next);
        model.addAttribute("next", target);
        model.addAttribute("email", email);

        Optional<PasswordSignInService.Session> session;
        try {
            session = signIn.signIn(email, password);
        } catch (IllegalStateException e) {
            // Configuration or reachability, not credentials. Distinguishing this for the
            // reporter is worth it: retrying a correct password forever is a bad afternoon.
            model.addAttribute("error", "Sign-in is not available right now. "
                    + "This is a problem on our side, not with your details.");
            return "mobile-signin";
        }

        if (session.isEmpty()) {
            // Deliberately one message for a wrong password and an unknown address alike.
            model.addAttribute("error", "That email address and password do not match an account.");
            return "mobile-signin";
        }

        response.addHeader(HttpHeaders.SET_COOKIE,
                AuthCookie.issue(session.get().idToken(), session.get().ttl(), request.isSecure()).toString());
        return "redirect:" + target;
    }

    @PostMapping("/signout")
    public String signOut(HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, AuthCookie.clear(request.isSecure()).toString());
        return "redirect:/m/signin";
    }

    /**
     * Where to go after signing in.
     *
     * <p>The value arrives in a query parameter, which means an attacker can put anything in it.
     * An unchecked redirect here would be a phishing gift: a link that really is on the
     * department's domain, really does show the department's sign-in form, and then lands the
     * reporter somewhere else entirely. So only paths inside the reporter surface survive, and
     * anything else falls back to the home screen.
     */
    private static String safeNext(String next) {
        if (next == null) return "/m";
        boolean insideSurface = next.equals("/m") || next.startsWith("/m/");
        // "//" and a scheme send the browser off-site. A backslash is normalised to a slash by
        // some browsers, so it reaches the same place by a different spelling. ".." stays on this
        // origin and so is not a phishing risk, but it walks out of the reporter surface, and a
        // redirect target that leaves the surface is not a redirect target this method should mint.
        boolean tricky = next.startsWith("//") || next.contains("://")
                         || next.contains("\\") || next.contains("..");
        return insideSurface && !tricky ? next : "/m";
    }
}
