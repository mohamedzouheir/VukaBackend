package za.gov.dsac.vuka.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;

/**
 * Exchanges an email address and password for a Firebase ID token, server side.
 *
 * <h2>Why the server does this rather than the phone</h2>
 *
 * The reporter surface ships no JavaScript, and the Firebase client SDK is about 100KB of it. On
 * the one page whose argument is that it costs a reporter almost nothing to open, that is not a
 * trade worth making. So the browser posts a plain HTML form, the server calls Google's Identity
 * Toolkit, and the resulting token goes into the cookie described in
 * {@code AuthCookie}. The reporter never runs a line of script.
 *
 * <p>What that costs, stated plainly: the password transits this server rather than going from
 * the phone straight to Google. It is never logged and never stored, and the process holds it
 * only for the length of one call. This is a documented Firebase flow rather than a workaround,
 * but it is a real difference from the SDK path and it belongs in the security conversation
 * rather than in a footnote.
 *
 * <h2>Failure is deliberately uninformative</h2>
 *
 * Identity Toolkit distinguishes an unknown email address from a wrong password. This class does
 * not pass that distinction on. Telling a caller that an address exists is an account enumeration
 * oracle, and the reporter gains nothing from it either.
 */
@Service
public class PasswordSignInService {

    private static final Logger log = LoggerFactory.getLogger(PasswordSignInService.class);

    private static final String ENDPOINT =
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

    /** Firebase ID tokens last an hour. Used when the response omits or mangles expiresIn. */
    private static final Duration DEFAULT_TTL = Duration.ofHours(1);

    private final RestClient http = RestClient.create();
    private final String webApiKey;

    /**
     * @param webApiKeyPath path to a file holding the Firebase Web API key, mirroring how the
     *                      service account is supplied. The key is read once at startup so the
     *                      value never sits in an environment variable, a process listing or an
     *                      image layer. The key is not a secret in Firebase's own model, because
     *                      every web client embeds it, but the loading pattern costs nothing and
     *                      keeps one rule for how this application takes configuration in.
     */
    public PasswordSignInService(@Value("${vuka.firebase.web-api-key-path:}") String webApiKeyPath) {
        this.webApiKey = readKey(webApiKeyPath);
    }

    private static String readKey(String path) {
        if (path == null || path.isBlank()) {
            log.info("No Firebase Web API key path configured. Password sign-in is unavailable; "
                     + "the citizen view and the token-header API are unaffected.");
            return "";
        }
        try {
            String key = Files.readString(Path.of(path), StandardCharsets.UTF_8).trim();
            if (key.isEmpty()) {
                log.warn("Firebase Web API key file at {} is empty. Password sign-in is unavailable.", path);
            }
            return key;
        } catch (IOException e) {
            // Not fatal. An unreadable key stops reporters signing in and stops nothing else,
            // and refusing to start would take the citizen view down with it.
            log.warn("Could not read the Firebase Web API key at {}: {}", path, e.getMessage());
            return "";
        }
    }

    public boolean isConfigured() {
        return !webApiKey.isEmpty();
    }

    /** An ID token and how long it is good for. */
    public record Session(String idToken, Duration ttl) {}

    private record SignInRequest(String email, String password, boolean returnSecureToken) {}

    private record SignInResponse(String idToken, String expiresIn) {}

    /**
     * @return the session, or empty when the credentials do not match an account
     * @throws IllegalStateException when sign-in is not configured or Google could not be reached
     */
    public Optional<Session> signIn(String email, String password) {
        if (!isConfigured()) {
            throw new IllegalStateException("No Firebase Web API key configured.");
        }
        try {
            SignInResponse body = http.post()
                    .uri(ENDPOINT + "?key={key}", webApiKey)
                    .body(new SignInRequest(email, password, true))
                    .retrieve()
                    .body(SignInResponse.class);

            if (body == null || body.idToken() == null || body.idToken().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(new Session(body.idToken(), ttlOf(body.expiresIn())));

        } catch (RestClientResponseException e) {
            // 400 is what Identity Toolkit returns for every bad-credential case. The specific
            // reason is logged for an operator and never returned to the caller.
            if (e.getStatusCode().is4xxClientError()) {
                log.debug("Sign-in rejected by Identity Toolkit: {}", e.getStatusText());
                return Optional.empty();
            }
            throw new IllegalStateException("Identity Toolkit returned " + e.getStatusCode(), e);
        } catch (RuntimeException e) {
            throw new IllegalStateException("Could not reach Identity Toolkit.", e);
        }
    }

    private static Duration ttlOf(String expiresInSeconds) {
        try {
            return Duration.ofSeconds(Long.parseLong(expiresInSeconds));
        } catch (NumberFormatException | NullPointerException e) {
            return DEFAULT_TTL;
        }
    }
}
