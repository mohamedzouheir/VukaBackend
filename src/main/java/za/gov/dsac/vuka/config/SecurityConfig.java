package za.gov.dsac.vuka.config;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.authentication.session.NullAuthenticatedSessionStrategy;


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
                // Authentication is rebuilt from a token on every request, so with the default
                // strategy every request counted as a fresh sign-in and deleted the CSRF cookie.
                // The browser's own favicon request after loading a form was enough to do it, and
                // every form on the phone then bounced to sign-in. Nothing here is a session to
                // fixate, so there is nothing for rotation to protect.
                .sessionAuthenticationStrategy(new NullAuthenticatedSessionStrategy())
                .ignoringRequestMatchers(request -> path(request).startsWith("/api/")))

            // No server-side session. The cookie carries a verified Firebase token, not a
            // session id, so there is no session state to fix over and nothing to expire
            // server side. This is what keeps the application horizontally scalable.
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            .authorizeHttpRequests(auth -> auth
                // Error rendering and internal forwards carry no data of their own and must not be
                // refused a second time. Without this, a 403 becomes an error dispatch that has
                // lost the principal, which then reads as "not signed in" and redirects.
                .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()

                // Citizen view, health, static assets.
                .requestMatchers("/public/**", "/actuator/health", "/css/**", "/js/**").permitAll()

                // The reporter has to be able to reach the sign-in form without being signed in.
                .requestMatchers("/m/signin").permitAll()
                // Anyone holding the cookie must be able to drop it, whatever their role. This used
                // to sit under the reporter-only rule, so a reviewer who signed in on a phone had
                // no way to sign out again.
                .requestMatchers("/m/signout").permitAll()
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

            // Not signed in and signed in as the wrong role are answered differently, and the API
            // and the phone surface are answered differently again. See AccessResponses for the
            // table. The previous single entry point, registered for /m, had become the default
            // for every path, so the API answered refusals with a redirect to the phone sign-in.
            .exceptionHandling(e -> e
                    .authenticationEntryPoint(AccessResponses.entryPoint())
                    .accessDeniedHandler(AccessResponses.deniedHandler()))

            .addFilterBefore(firebaseTokenFilter, UsernamePasswordAuthenticationFilter.class);

        // After the real verifier, and it only fills a context the real verifier left empty, so a
        // signed token always wins over a development one.
        DevAuthFilter dev = devAuthFilter.getIfAvailable();
        if (dev != null) {
            http.addFilterAfter(dev, FirebaseTokenFilter.class);
        }

        return http.build();
    }

    private static String path(HttpServletRequest request) {
        return AccessResponses.path(request);
    }
}
