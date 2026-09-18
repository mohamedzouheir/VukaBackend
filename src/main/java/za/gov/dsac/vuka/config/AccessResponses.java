package za.gov.dsac.vuka.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a caller is told when they cannot have what they asked for.
 *
 * <h2>Two questions, answered differently</h2>
 *
 * <b>Not signed in</b> and <b>signed in as the wrong role</b> are different situations with
 * different fixes, and the response says which one it is:
 *
 * <pre>
 *                     not signed in                 signed in, wrong role
 *   /api/**           401, JSON                     403, JSON naming the role and what it can do
 *   /m/**             redirect to sign in, back     403, a page saying whose surface this is
 *                     to the same place after       and where this person's own work is
 * </pre>
 *
 * The bug this replaces: every refusal, on every path, was a redirect to the reporter sign-in
 * page, because one entry point registered for one matcher becomes the default for all of them.
 * A reviewer's dashboard received an HTML redirect where it expected JSON, and a reviewer who
 * opened a reporter link was sent to sign in again, successfully, and then refused again, in a
 * loop with no explanation.
 */
public final class AccessResponses {

    private static final ObjectMapper JSON = new ObjectMapper();

    private AccessResponses() {}

    /** Not signed in. The phone surface sends the reporter to sign in; the API says 401. */
    public static AuthenticationEntryPoint entryPoint() {
        return (request, response, ex) -> {
            if (isMobile(request)) {
                response.sendRedirect(signInWithReturnTo(request));
                return;
            }
            writeJson(response, HttpServletResponse.SC_UNAUTHORIZED, body(
                    "unauthenticated", "Sign in to continue.", null));
        };
    }

    /** Signed in, but this role does not include the action. */
    public static AccessDeniedHandler deniedHandler() {
        return (request, response, ex) -> {
            VukaPrincipal who = principal();
            if (who == null) {
                // A CSRF failure on an anonymous request lands here too. Treat it as not signed in.
                entryPoint().commence(request, response,
                        new org.springframework.security.authentication.InsufficientAuthenticationException("no principal"));
                return;
            }
            if (isMobile(request)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                try {
                    // A page, not a redirect. Redirecting a signed-in reviewer to the sign-in form
                    // is what produced the loop; telling them where their work is ends it.
                    request.getRequestDispatcher("/access/denied").forward(request, response);
                } catch (ServletException e) {
                    throw new IOException(e);
                }
                return;
            }
            writeJson(response, HttpServletResponse.SC_FORBIDDEN, body(
                    "forbidden",
                    "Signed in as " + who.roleLabel() + ". That role does not include this action.",
                    who));
        };
    }

    private static Map<String, Object> body(String error, String message, VukaPrincipal who) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        body.put("message", message);
        if (who != null) {
            body.put("role", who.role());
            // What they can do instead, so a client can recover rather than just stop.
            List<String> caps = Capability.of(who.role()).stream().map(Enum::name).toList();
            body.put("capabilities", caps);
        }
        return body;
    }

    private static void writeJson(HttpServletResponse response, int status, Map<String, Object> body)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        JSON.writeValue(response.getOutputStream(), body);
    }

    private static VukaPrincipal principal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof VukaPrincipal who ? who : null;
    }

    static boolean isMobile(HttpServletRequest request) {
        String path = path(request);
        return path.equals("/m") || path.startsWith("/m/");
    }

    private static String signInWithReturnTo(HttpServletRequest request) {
        if (!"GET".equals(request.getMethod())) return "/m/signin";
        return "/m/signin?next=" + URLEncoder.encode(path(request), StandardCharsets.UTF_8);
    }

    static String path(HttpServletRequest request) {
        String servletPath = request.getServletPath();
        return servletPath == null || servletPath.isEmpty() ? request.getRequestURI() : servletPath;
    }
}
