package za.gov.dsac.vuka.config;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Turns a Firebase ID token into a Spring Security authentication.
 *
 * Two custom claims are read from the token and set by an administrator through
 * {@code UserAdminService}:
 *
 *   role      one of ENTITY_REPORTER, DSAC_REVIEWER, DSAC_EXECUTIVE, ADMIN
 *   entityId  the entity a reporter is bound to; absent for DSAC roles
 *
 * The entityId claim is what stops one entity reading another's data. It lives on the
 * token rather than in a request parameter precisely so a client cannot choose it.
 */
@Component
public class FirebaseTokenFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(FirebaseTokenFilter.class);

    private final FirebaseAuth firebaseAuth;

    public FirebaseTokenFilter(FirebaseAuth firebaseAuth) {
        this.firebaseAuth = firebaseAuth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String idToken = header.substring(7);
            try {
                FirebaseToken token = firebaseAuth.verifyIdToken(idToken);
                Map<String, Object> claims = token.getClaims();

                String role = claims.get("role") == null ? null : claims.get("role").toString();
                String entityId = claims.get("entityId") == null ? null : claims.get("entityId").toString();

                if (role != null) {
                    var principal = new VukaPrincipal(
                            token.getUid(),
                            token.getEmail(),
                            token.getName(),
                            role,
                            entityId);

                    var auth = new UsernamePasswordAuthenticationToken(
                            principal, null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role)));

                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (FirebaseAuthException e) {
                // An invalid token is not an error worth a stack trace: it is an
                // unauthenticated request, and the security config will reject it.
                log.debug("Rejected ID token: {}", e.getMessage());
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }

    /** Never filter the public citizen view or the health endpoint. */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/public") || path.startsWith("/actuator/health");
    }
}
