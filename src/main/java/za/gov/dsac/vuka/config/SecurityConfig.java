package za.gov.dsac.vuka.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.util.matcher.AnyRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Access control.
 *
 * Five decisions here are worth pointing at when asked about governance:
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
 *
 *   - The dashboard's own HTML and JavaScript are public; its data is not. A single page
 *     application has to be able to load before it can ask who is signed in, so the shell is
 *     permitAll and every /api route underneath it is authenticated. Nothing about an entity's
 *     reporting is in the bundle: it is a router, nine components and a fetch client, and it
 *     renders a sign-in form until the API accepts a token.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final FirebaseTokenFilter firebaseTokenFilter;

    /**
     * The development sign in, which exists only where {@code vuka.dev-auth.enabled} is true.
     *
     * <p>Injected as a provider rather than a bean so that with the property off there is no
     * filter in the chain at all. There is then nothing to bypass and nothing to misconfigure
     * into a bypass, which is a stronger position than a filter that checks a flag at runtime.
     */
    private final ObjectProvider<DevAuthFilter> devAuthFilter;

    public SecurityConfig(FirebaseTokenFilter firebaseTokenFilter,
                          ObjectProvider<DevAuthFilter> devAuthFilter) {
        this.firebaseTokenFilter = firebaseTokenFilter;
        this.devAuthFilter = devAuthFilter;
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

                // The error dispatch, and leaving this out silently broke every error response.
                // When a controller throws, Spring forwards to /error, and that forward is an
                // ERROR dispatch: OncePerRequestFilter.shouldNotFilterErrorDispatch() is true by
                // default, so neither authentication filter runs and the forward arrives
                // unauthenticated. With /error authenticated, the entry point answered it and the
                // real status was thrown away. An authenticated caller with the wrong role got a
                // 401 instead of a 403, which reads to a client as an expired session and sends
                // the user round a sign-out loop rather than telling them the truth. Permitting
                // the dispatch does not expose anything: what the error page contains is decided
                // by the server.error properties, which include no message and no stack trace.
                .requestMatchers("/error").permitAll()

                // The reporter has to be able to reach the sign-in form without being signed in.
                .requestMatchers("/m/signin").permitAll()
                // Everything else under /m writes performance data in a named person's name.
                .requestMatchers("/m/**").hasRole("ENTITY_REPORTER")

                // The dashboard shell. These are routes of a client side router: the server has
                // no page for them, it returns index.html and the application then asks /api/me
                // who is calling. Gating them here would mean a 401 on a request for a
                // JavaScript bundle, which a browser renders as a blank screen with no
                // explanation. Note that /admin/entities/** is the dashboard's own route and not
                // an API path: the administration endpoints live under /api/admin and carry a
                // method level ADMIN check.
                .requestMatchers("/", "/index.html", "/favicon.ico", "/assets/**",
                                 "/signin", "/entity/**", "/review/**", "/portfolio/**",
                                 "/admin/entities/**").permitAll()

                // Everything else needs a verified Firebase token carrying a role claim. That
                // includes every /api route, so the shell above can be read by anyone and the
                // data underneath it cannot.
                .anyRequest().authenticated())

            // A browser that hits 401 on an ordinary page navigation has reached a dead end, so
            // the reporter surface redirects and carries the path it was heading for: an expired
            // token then costs the reporter nothing but a sign-in, and where they were is in the
            // URL, which is the property the whole mobile flow is built on.
            //
            // The second mapping is not optional, and leaving it out was a live bug. Spring's
            // ExceptionHandlingConfigurer only builds a DelegatingAuthenticationEntryPoint when
            // there is more than one mapping; with exactly one it uses that entry point for every
            // request and ignores the matcher entirely. So a single mobile mapping sent
            // unauthenticated API callers a 302 to /m/signin instead of a 401, and a fetch client
            // cannot tell a redirected HTML page from an expired session. Anything not under /m
            // gets a plain 401.
            .exceptionHandling(e -> e
                    .defaultAuthenticationEntryPointFor(
                            (request, response, ex) -> response.sendRedirect(signInWithReturnTo(request)),
                            MOBILE_SURFACE)
                    .defaultAuthenticationEntryPointFor(
                            new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                            AnyRequestMatcher.INSTANCE))

            .addFilterBefore(firebaseTokenFilter, UsernamePasswordAuthenticationFilter.class);

        // After the real verifier, and it only fills a context the real verifier left empty, so a
        // signed token always wins over a development one.
        DevAuthFilter dev = devAuthFilter.getIfAvailable();
        if (dev != null) {
            http.addFilterAfter(dev, FirebaseTokenFilter.class);
        }

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
