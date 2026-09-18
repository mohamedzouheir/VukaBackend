package za.gov.dsac.vuka.config;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * The capability check, as a bean the {@code @PreAuthorize} expressions can call.
 *
 * <p>Written as {@code @PreAuthorize("@can.has('REVIEW_SUBMISSIONS')")}. A misspelt capability
 * throws rather than denying quietly, so a typo fails the first request that reaches it and not
 * the demonstration a week later.
 */
@Component("can")
public class Can {

    public boolean has(String capability) {
        Capability wanted = Capability.valueOf(capability);
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof VukaPrincipal who)) return false;
        return wanted.grantedTo(who.role());
    }
}
