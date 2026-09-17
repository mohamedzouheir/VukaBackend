package za.gov.dsac.vuka.config;

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
 * Two decisions here are worth pointing at when asked about governance:
 *
 *   - /public/** is open to the world and read-only. The citizen view is served from a
 *     narrow projection that a Cloud job writes only for entities DSAC has approved for
 *     publication. Whether to publish is a departmental decision, not a product one.
 *
 *   - There is no endpoint anywhere that updates a confirmed TargetResult. A reviewer who
 *     disputes a figure returns the submission to the entity. Performance data is
 *     append-only by construction rather than by policy.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final FirebaseTokenFilter firebaseTokenFilter;

    public SecurityConfig(FirebaseTokenFilter firebaseTokenFilter) {
        this.firebaseTokenFilter = firebaseTokenFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Citizen view and the low-bandwidth submission entry point.
                .requestMatchers("/public/**", "/actuator/health", "/css/**", "/js/**").permitAll()
                // Everything else needs a verified Firebase token carrying a role claim.
                .anyRequest().authenticated()
            )
            .addFilterBefore(firebaseTokenFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
