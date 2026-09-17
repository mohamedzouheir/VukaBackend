package za.gov.dsac.vuka.config;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Access control.
 *
 * Three decisions here are worth pointing at when asked about governance:
 *
 *   - /public/** is open to the world and read-only. The citizen view is served from a
 *     narrow projection that a Cloud job writes only for entities DSAC has approved for
 *     publication. Whether to publish is a departmental decision, not a product one.
 *
 *   - There is no endpoint anywhere that updates a confirmed TargetResult. A reviewer who
 *     disputes a figure returns the submission to the entity. Performance data is
 *     append-only by construction rather than by policy.
 *
 *   - The dashboard's own HTML and JavaScript are public; its data is not. A single page
 *     application has to be able to load before it can ask who is signed in, so the shell
 *     is permitAll and every /api route underneath it is authenticated. Nothing about an
 *     entity's reporting is in the bundle: it is a router, nine components and a fetch
 *     client, and it renders a sign in form until the API accepts a token.
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
            .csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Citizen view, health, and the static assets of both surfaces.
                .requestMatchers("/public/**", "/actuator/health", "/css/**", "/js/**").permitAll()

                // The dashboard shell. These are routes of a client side router: the server has no
                // page for them, it returns index.html and the application then asks /api/me who
                // is calling. Gating them here would mean a 401 on a request for a JavaScript
                // bundle, which a browser renders as a blank screen with no explanation.
                .requestMatchers("/", "/index.html", "/favicon.ico", "/assets/**",
                                 "/signin", "/entity/**", "/review/**", "/portfolio/**",
                                 "/admin/entities/**").permitAll()

                // Everything else needs a verified Firebase token carrying a role claim. That
                // includes every /api route, so the shell above can be read by anyone and the data
                // underneath it cannot.
                .anyRequest().authenticated()
            )
            .addFilterBefore(firebaseTokenFilter, UsernamePasswordAuthenticationFilter.class);

        // After the real verifier, and it only fills a context the real verifier left empty, so a
        // signed token always wins over a development one.
        DevAuthFilter dev = devAuthFilter.getIfAvailable();
        if (dev != null) {
            http.addFilterAfter(dev, FirebaseTokenFilter.class);
        }

        return http.build();
    }
}
