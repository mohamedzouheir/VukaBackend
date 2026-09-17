package za.gov.dsac.vuka.config;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;

import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;

/**
 * The Firebase ID token as a browser cookie, for the server-rendered reporter surface.
 *
 * <h2>Why a cookie exists at all</h2>
 *
 * The React dashboard holds its token in memory and sends it as an {@code Authorization} header.
 * A phone opening {@code /m} cannot do that: a browser navigation sends cookies and nothing else.
 * Without this the low-bandwidth surface answers 401 to every request, which is what it did.
 *
 * <p>The alternative was to put the Firebase JavaScript SDK on the sign-in page and have it post
 * a token back. That is the pattern Firebase documents, and it costs about 100KB of JavaScript on
 * the one page whose entire reason for existing is that it does not ship any. So the server signs
 * in on the reporter's behalf and sets this instead.
 *
 * <h2>The three flags, and what each one stops</h2>
 *
 * <ul>
 *   <li>{@code HttpOnly} means script cannot read it, so a cross-site scripting bug cannot walk
 *       away with a reporter's session.</li>
 *   <li>{@code SameSite=Strict} means a form on another site cannot make an authenticated request
 *       with it. That is the first and strongest cross-site request forgery defence, and the CSRF
 *       token in {@link SecurityConfig} is the second.</li>
 *   <li>{@code Secure} is taken from {@code request.isSecure()} rather than hard-coded, so a
 *       deployment over https always gets it and a local demo over http still works. Behind a
 *       proxy this depends on {@code server.forward-headers-strategy}, which is set.</li>
 * </ul>
 *
 * <p>The cookie holds the ID token only, never the refresh token. A Firebase ID token lasts an
 * hour, so a long session expires and the reporter signs in again. That is deliberate: a refresh
 * token in a browser is a long-lived credential, and the cost of expiry here is close to zero
 * because each step is written as it is answered and the step index is in the URL. Signing in
 * again returns the reporter to the step they were on.
 */
public final class AuthCookie {

    public static final String NAME = "vuka_token";

    private AuthCookie() {}

    public static Optional<String> read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return Optional.empty();
        return Arrays.stream(cookies)
                .filter(c -> NAME.equals(c.getName()))
                .map(Cookie::getValue)
                .filter(v -> v != null && !v.isBlank())
                .findFirst();
    }

    public static ResponseCookie issue(String idToken, Duration ttl, boolean secure) {
        return base(secure).value(idToken).maxAge(ttl).build();
    }

    public static ResponseCookie clear(boolean secure) {
        return base(secure).value("").maxAge(Duration.ZERO).build();
    }

    private static ResponseCookie.ResponseCookieBuilder base(boolean secure) {
        return ResponseCookie.from(NAME, "")
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path("/");
    }
}
