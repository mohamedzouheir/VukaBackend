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
import java.util.Optional;

/**
 * Turns a Firebase ID token into a Spring Security authentication.
 *
 * The token arrives one of two ways, because there are two kinds of client. The React
 * dashboard and the API send an {@code Authorization: Bearer} header. A phone opening the
 * server-rendered reporter surface sends the {@link AuthCookie}, because a browser navigation
 * can send a cookie and cannot send a header. The header is checked first so an explicit
 * credential always beats an ambient one.
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

        String idToken = bearerToken(request).or(() -> AuthCookie.read(request)).orElse(null);
        if (idToken != null) {
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
                // An expired cookie lands here too, and the entry point sends the
                // reporter back to sign in and then on to the step they were reading.
                log.debug("Rejected ID token: {}", e.getMessage());
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }

    private static Optional<String> bearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return header != null && header.startsWith("Bearer ")
                ? Optional.of(header.substring(7))
                : Optional.empty();
    }

    /** Never filter the public citizen view or the health endpoint. */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/public") || path.startsWith("/actuator/health");
    }
}
