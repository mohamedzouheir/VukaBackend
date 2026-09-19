package za.gov.dsac.vuka.service.karabo;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * What Karabo needs to reach a model deployed in Microsoft Foundry.
 *
 * <h2>The key is read from a file where it can be</h2>
 *
 * Same rule as the Microsoft client secret and the Firebase web API key: the path is
 * configuration and the value is not, so in a deployment the key never sits in an environment
 * variable, a process listing or an image layer. {@code apiKey} is accepted as well because it is
 * what a developer has to hand on a laptop, and the file wins where both are set.
 *
 * <p>Nothing is configured by default, and that is a supported state: the panel says Karabo is
 * not connected and every other screen carries on. It fails closed, never open.
 *
 * <h2>Why the anonymous switch exists</h2>
 *
 * Karabo sits on the landing page, where nobody is signed in. A public endpoint in front of a paid
 * model is something anyone can run up, so the department may want it off for the public and on
 * for staff, and that is a setting, not a rebuild. Off means an anonymous caller is told to sign
 * in. Either way an anonymous caller only ever reaches published data; see {@link KaraboTools}.
 */
@Component
@ConfigurationProperties(prefix = "vuka.karabo")
public class KaraboProperties {

    /** The Foundry resource, as {@code https://<resource>.openai.azure.com}. No trailing path. */
    private String endpoint = "";

    /** The deployment name given in Foundry, which is not always the model's own name. */
    private String deployment = "";

    /** Path to a file holding the API key. Preferred. */
    private String apiKeyPath = "";

    /** The key itself, for local development. Ignored where {@code apiKeyPath} is set. */
    private String apiKey = "";

    /** Whether a caller who is not signed in may ask at all. */
    private boolean publicEnabled = true;

    /** Longest single question accepted, in characters. */
    private int maxMessageChars = 1000;

    /** How many earlier turns are sent back to the model with each question. */
    private int maxHistory = 8;

    /** Rounds of tool calling before Karabo stops and says it could not finish. */
    private int maxToolRounds = 5;

    /**
     * Upper bound on one reply, in tokens. Generous on purpose: a reasoning model spends part of
     * this thinking before it writes, and with a tight cap it can spend all of it and return
     * nothing. The system prompt, not this number, is what keeps answers short.
     */
    private int maxReplyTokens = 4000;

    /** Questions per minute from one signed-in person. */
    private int perMinuteSignedIn = 20;

    /** Questions per minute from one address that is not signed in. */
    private int perMinutePublic = 6;

    /** Questions per day from one address that is not signed in. The cost ceiling, in effect. */
    private int perDayPublic = 60;

    /** How long to wait for Foundry before telling the reader it did not answer. */
    private int timeoutSeconds = 45;

    public boolean isConfigured() {
        // The placeholder in karabo.local.example.ps1 counts as no key, so a half-filled file
        // reads as "not connected" rather than as a Foundry error on the first question.
        boolean realKey = notBlank(apiKey) && !apiKey.startsWith("paste-your");
        return notBlank(endpoint) && notBlank(deployment) && (notBlank(apiKeyPath) || realKey);
    }

    /** Read when needed, so a rotated key does not need a restart. */
    public String key() {
        if (notBlank(apiKeyPath)) {
            try {
                return Files.readString(Path.of(apiKeyPath), StandardCharsets.UTF_8).trim();
            } catch (IOException e) {
                throw new UncheckedIOException("Could not read the Foundry API key file", e);
            }
        }
        return apiKey.trim();
    }

    /** The v1 chat completions route, which takes the deployment name as the model. */
    public String chatUrl() {
        // Foundry shows the endpoint in more than one form, and the one with /openai/v1 on the end
        // is an easy one to copy. Accept any of them rather than build a URL with the path twice.
        String base = endpoint.trim().replaceAll("/+$", "")
                .replaceAll("(?i)/openai(/v1)?(/chat/completions)?$", "");
        return base + "/openai/v1/chat/completions";
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    public String getEndpoint() { return endpoint; }
    public void setEndpoint(String endpoint) { this.endpoint = endpoint; }

    public String getDeployment() { return deployment; }
    public void setDeployment(String deployment) { this.deployment = deployment; }

    public String getApiKeyPath() { return apiKeyPath; }
    public void setApiKeyPath(String apiKeyPath) { this.apiKeyPath = apiKeyPath; }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public boolean isPublicEnabled() { return publicEnabled; }
    public void setPublicEnabled(boolean publicEnabled) { this.publicEnabled = publicEnabled; }

    public int getMaxMessageChars() { return maxMessageChars; }
    public void setMaxMessageChars(int maxMessageChars) { this.maxMessageChars = maxMessageChars; }

    public int getMaxHistory() { return maxHistory; }
    public void setMaxHistory(int maxHistory) { this.maxHistory = maxHistory; }

    public int getMaxToolRounds() { return maxToolRounds; }
    public void setMaxToolRounds(int maxToolRounds) { this.maxToolRounds = maxToolRounds; }

    public int getMaxReplyTokens() { return maxReplyTokens; }
    public void setMaxReplyTokens(int maxReplyTokens) { this.maxReplyTokens = maxReplyTokens; }

    public int getPerMinuteSignedIn() { return perMinuteSignedIn; }
    public void setPerMinuteSignedIn(int perMinuteSignedIn) { this.perMinuteSignedIn = perMinuteSignedIn; }

    public int getPerMinutePublic() { return perMinutePublic; }
    public void setPerMinutePublic(int perMinutePublic) { this.perMinutePublic = perMinutePublic; }

    public int getPerDayPublic() { return perDayPublic; }
    public void setPerDayPublic(int perDayPublic) { this.perDayPublic = perDayPublic; }

    public int getTimeoutSeconds() { return timeoutSeconds; }
    public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
}
