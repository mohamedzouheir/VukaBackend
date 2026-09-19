package za.gov.dsac.vuka.web;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import za.gov.dsac.vuka.config.VukaPrincipal;
import za.gov.dsac.vuka.service.karabo.KaraboException;
import za.gov.dsac.vuka.service.karabo.KaraboService;

import java.util.List;
import java.util.Map;

/**
 * Ask Karabo.
 *
 * <p>Open to a caller who is not signed in, on purpose: Karabo sits on the landing page. What an
 * anonymous caller can reach is decided by the tools, not by this door, and it is the published
 * projection and nothing else. A signed-in caller's token is read as usual by the filters in
 * front of this, so their question runs with their access and no more. See
 * {@link za.gov.dsac.vuka.service.karabo.KaraboTools}.
 *
 * <p>A failure is answered with a code, never a sentence and never the provider's own error. The
 * panel turns the code into words in the reader's language.
 */
@RestController
@RequestMapping("/api/chat")
public class KaraboController {

    private static final Logger log = LoggerFactory.getLogger(KaraboController.class);

    private final KaraboService karabo;

    public KaraboController(KaraboService karabo) {
        this.karabo = karabo;
    }

    public record Ask(String question, List<KaraboService.Turn> history, String lang) {}

    /** Whether Karabo can answer this caller at all, so the panel can say so before they type. */
    @GetMapping("/status")
    public Map<String, Object> status(@AuthenticationPrincipal VukaPrincipal who) {
        return Map.of(
                "configured", karabo.configured(),
                "available", karabo.configured() && (who != null || karabo.publicEnabled()),
                "signedIn", who != null);
    }

    @PostMapping
    public KaraboService.Reply ask(@RequestBody Ask body,
                                   @AuthenticationPrincipal VukaPrincipal who,
                                   HttpServletRequest request) {
        if (body == null) throw new KaraboException(KaraboException.Kind.INVALID, "No body");
        return karabo.ask(who, request.getRemoteAddr(), body.question(), body.history(), body.lang());
    }

    @ExceptionHandler(KaraboException.class)
    public ResponseEntity<Map<String, String>> refused(KaraboException e) {
        HttpStatus status = switch (e.kind()) {
            case NOT_CONFIGURED -> HttpStatus.SERVICE_UNAVAILABLE;
            case SIGN_IN_REQUIRED -> HttpStatus.UNAUTHORIZED;
            case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
            case INVALID -> HttpStatus.BAD_REQUEST;
            case FILTERED -> HttpStatus.UNPROCESSABLE_ENTITY;
            case TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
            case PROVIDER -> HttpStatus.BAD_GATEWAY;
        };
        return ResponseEntity.status(status).body(Map.of("error", e.kind().name()));
    }

    /** Anything else, a bug in a tool most likely. Logged in full here, and a code to the browser. */
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> failed(RuntimeException e) {
        log.error("Karabo failed", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "PROVIDER"));
    }
}
