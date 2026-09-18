package za.gov.dsac.vuka.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Tells the service worker whose page it is holding on the phone surface.
 *
 * <h2>Why the offline layer needs to know</h2>
 *
 * A reporter who loses signal mid-report can keep answering: the service worker saves each answer
 * on the phone and sends it when the connection comes back. Every figure in Vuka carries the name
 * of the person who confirmed it, and that is the governance claim the append-only record rests
 * on. An answer typed by one reporter and sent later under another reporter's session would put
 * the wrong name on a figure. On a phone shared across an NPO's two or three staff, that is the
 * ordinary case rather than an edge case.
 *
 * <p>So every page under {@code /m} carries {@code X-Vuka-User}, and the worker stamps each saved
 * answer with the value from the last page it saw. Before sending one it fetches the form again,
 * which also gets it a fresh CSRF token, and sends only if the header on that page still matches.
 * An answer saved by someone else waits for them to sign back in.
 *
 * <p>A digest rather than the uid. The worker only has to compare two values, and a digest does
 * that without putting an identifier in a header.
 */
@Configuration
public class OfflineIdentity implements WebMvcConfigurer {

    public static final String HEADER = "X-Vuka-User";

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                Authentication auth = SecurityContextHolder.getContext().getAuthentication();
                if (auth != null && auth.getPrincipal() instanceof VukaPrincipal who && who.uid() != null) {
                    response.setHeader(HEADER, digest(who.uid()));
                }
                return true;
            }
        }).addPathPatterns("/m", "/m/**");
    }

    static String digest(String uid) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(uid.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required of every JVM", e);
        }
    }
}
