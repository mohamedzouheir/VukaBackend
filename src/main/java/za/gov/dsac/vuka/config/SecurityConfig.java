package za.gov.dsac.vuka.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.util.matcher.RequestMatcher;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Access control.
 *
 * Four decisions here are worth pointing at when asked about governance:
 *
 *   - /public/** is open to the world and read-only. The citizen view is served from a
 *     narrow projection covering only entities DSAC has approved for publication. Whether to
 *     publish is a departmental decision, not a product one.
 *
 *   - There is no endpoint anywhere that updates a confirmed TargetResult. A reviewer who
 *     disputes a figure returns the submission to the entity. Performance data is
 *     append-only by construction rather than by policy.
 *
 *   - /m/** requires ENTITY_REPORTER rather than merely requiring a signed-in caller. It
 *     writes performance data, and a DSAC reviewer must never be able to write a figure on an
 *     entity's behalf. Authentication alone would have let them, because the tenancy helper
 *     lets DSAC roles read everything.
 *
 *   - CSRF protection is on wherever the credential is ambient, and off where it is not.
 *     See below, because the split is the whole of the reasoning.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final FirebaseTokenFilter firebaseTokenFilter;

    public SecurityConfig(FirebaseTokenFilter firebaseTokenFilter) {
        this.firebaseTokenFilter = firebaseTokenFilter;
    }

    /** Anything under the server-rendered reporter surface, which is the cookie-authenticated part. */
    private static final RequestMatcher MOBILE_SURFACE =
            request -> path(request).equals("/m") || path(request).startsWith("/m/");

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // Cross-site request forgery needs a credential the browser attaches by itself. The
            // API has none: it carries a bearer token that an attacker's page cannot make the
            // browser send, so CSRF protection there would be ceremony. The /m surface does have
            // one, because it authenticates from a cookie, so it gets a token as well as the
            // SameSite=Strict flag on the cookie itself. Two independent defences, because
            // SameSite is a browser behaviour and the token is ours.
            .csrf(csrf -> csrf
                .csrfTokenRepository(new CookieCsrfTokenRepository())
                .ignoringRequestMatchers(request -> path(request).startsWith("/api/")))

            // No server-side session. The cookie carries a verified Firebase token, not a
            // session id, so there is no session state to fix over and nothing to expire
            // server side. This is what keeps the application horizontally scalable.
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            .authorizeHttpRequests(auth -> auth
                // Citizen view, health, static assets.
                .requestMatchers("/public/**", "/actuator/health", "/css/**", "/js/**").permitAll()
                // The reporter has to be able to reach the sign-in form without being signed in.
                .requestMatchers("/m/signin").permitAll()
                // Everything else under /m writes performance data in a named person's name.
                .requestMatchers("/m/**").hasRole("ENTITY_REPORTER")
                // Everything else needs a verified Firebase token carrying a role claim.
                .anyRequest().authenticated())

            // A browser that hits 401 on an ordinary page navigation has reached a dead end. The
            // API still gets its 401; only the reporter surface redirects, and it carries the
            // path it was heading for so an expired token costs the reporter nothing but a
            // sign-in. Where they were is in the URL, which is the same property the whole
            // mobile flow is built on.
            .exceptionHandling(e -> e.defaultAuthenticationEntryPointFor(
                    (request, response, ex) -> response.sendRedirect(signInWithReturnTo(request)),
                    MOBILE_SURFACE))

            .addFilterBefore(firebaseTokenFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private static String signInWithReturnTo(HttpServletRequest request) {
        if (!"GET".equals(request.getMethod())) return "/m/signin";
        return "/m/signin?next=" + URLEncoder.encode(path(request), StandardCharsets.UTF_8);
    }

    private static String path(HttpServletRequest request) {
        String servletPath = request.getServletPath();
        return servletPath == null || servletPath.isEmpty() ? request.getRequestURI() : servletPath;
    }
}
