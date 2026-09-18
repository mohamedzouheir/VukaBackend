package za.gov.dsac.vuka.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import za.gov.dsac.vuka.repository.PublicEntityRepository;

import java.io.IOException;
import java.util.List;

/**
 * A development sign in, so the application can be demonstrated without a Firebase project.
 *
 * <h2>Why this exists at all</h2>
 *
 * Identity is the one part of this system that cannot be exercised on a laptop with no external
 * service attached, and the alternative to this filter is a presenter discovering at three in the
 * morning that nobody can log in. It also lets the four role journeys be walked end to end before
 * any Firebase console work is done, which is the demonstrable outcome of block 2 in the build
 * order.
 *
 * <h2>Why it is safe to have in the repository</h2>
 *
 * The bean does not exist unless {@code vuka.dev-auth.enabled} is true, through
 * {@link ConditionalOnProperty}, and the property defaults to false. With the property off there
 * is no filter in the chain at all, so there is nothing to bypass and nothing to misconfigure into
 * a bypass. It logs a warning on every startup where it is on, the frontend carries a banner on
 * every page while it is on, and the token it accepts is deliberately not a JWT so that nothing
 * about it can be mistaken for a real credential.
 *
 * <p>It runs after {@link FirebaseTokenFilter}, and only where that filter left the context empty,
 * so a real signed token always wins.
 *
 * <p>Token shape: {@code dev|ROLE|entityId|Display Name}, sent as a bearer token. The entity id is
 * still the tenancy boundary, so a dev reporter reaches exactly one entity and every controller
 * check applies unchanged. What is switched off is signature verification, not authorisation.
 */
@Component
@ConditionalOnProperty(name = "vuka.dev-auth.enabled", havingValue = "true")
public class DevAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(DevAuthFilter.class);

    private static final List<String> ROLES =
            List.of("ENTITY_REPORTER", "DSAC_REVIEWER", "DSAC_EXECUTIVE", "ADMIN");

    private final PublicEntityRepository entities;
    private final String demoReporterEntity;
    private volatile String demoReporterEntityId;

    public DevAuthFilter(@Value("${spring.profiles.active:default}") String profile,
                         @Value("${vuka.demo.reporter-entity:Iziko}") String demoReporterEntity,
                         PublicEntityRepository entities) {
        this.entities = entities;
        this.demoReporterEntity = demoReporterEntity;
        log.warn("");
        log.warn("  DEVELOPMENT SIGN IN IS ENABLED. Bearer tokens are not verified and any role");
        log.warn("  can be assumed by anyone who can reach this port. Active profile: {}", profile);
        log.warn("  Set vuka.dev-auth.enabled=false, or unset VUKA_DEV_AUTH, before deploying.");
        log.warn("");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        // A real verified token always wins. This filter only fills an empty context.
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer dev|")) {
                authenticate(header.substring(7));
            }
        }
        chain.doFilter(request, response);
    }

    private void authenticate(String token) {
        // dev|ROLE|entityId|Name. Split with a limit so a display name may contain a pipe.
        String[] parts = token.split("\\|", 4);
        if (parts.length < 2) return;

        String role = parts[1].trim().toUpperCase();
        if (!ROLES.contains(role)) {
            log.debug("Rejected dev token: unknown role {}", role);
            return;
        }

        String entityId = parts.length > 2 && !parts[2].isBlank() ? parts[2].trim() : null;
        String name = parts.length > 3 && !parts[3].isBlank() ? parts[3].trim() : "Development user";

        // A DSAC role carries no entity, exactly as a real token would not. Letting a dev reviewer
        // hold an entityId would make the dev path behave differently from the real one, which is
        // the one thing a development shortcut must not do.
        if (!"ENTITY_REPORTER".equals(role)) entityId = null;
        // A dev reporter with no entity is the demo reporter, whose uid the demo data already
        // binds to this entity. Saves pasting a uuid mid-demonstration; a real token never
        // reaches this line.
        else if (entityId == null) entityId = demoReporterEntityId();

        VukaPrincipal principal = new VukaPrincipal(
                "dev-" + role.toLowerCase(),
                "dev." + role.toLowerCase() + "@example.invalid",
                name, role, entityId);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private String demoReporterEntityId() {
        if (demoReporterEntityId == null) {
            demoReporterEntityId = entities.findAll().stream()
                    .filter(e -> demoReporterEntity.equals(e.getShortName()))
                    .map(e -> e.getId().toString())
                    .findFirst()
                    .orElse(null);
        }
        return demoReporterEntityId;
    }
}
