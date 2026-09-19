package za.gov.dsac.vuka.service.karabo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;

/**
 * A model deployed in Microsoft Foundry, over the Azure OpenAI v1 endpoint.
 *
 * <h2>Why no SDK</h2>
 *
 * The v1 endpoint is the OpenAI chat completions API at {@code /openai/v1/}, with the deployment
 * name as the model and the key in an {@code api-key} header. That is one POST. The JDK's client
 * and the Jackson already on the classpath carry it, so Karabo adds no dependency, no transitive
 * tree and nothing that has to be reviewed or patched on its own schedule.
 *
 * <h2>What is logged and what is not</h2>
 *
 * A refusal from Foundry is logged with its status and the start of its body, because that is
 * what diagnoses a wrong deployment name or an expired key. The key is never logged, and the
 * conversation is never logged either: a reporter's question can name their entity and their
 * figures, and a log is not where that belongs.
 */
@Component
public class FoundryChatModel implements ChatModel {

    private static final Logger log = LoggerFactory.getLogger(FoundryChatModel.class);

    private final KaraboProperties props;
    private final ObjectMapper json;
    private final HttpClient http;

    public FoundryChatModel(KaraboProperties props, ObjectMapper json) {
        this.props = props;
        this.json = json;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Override
    public JsonNode next(ArrayNode messages, ArrayNode tools) {
        if (!props.isConfigured()) {
            throw new KaraboException(KaraboException.Kind.NOT_CONFIGURED, "Karabo is not configured");
        }

        ObjectNode body = json.createObjectNode();
        body.put("model", props.getDeployment());
        body.set("messages", messages);
        if (!tools.isEmpty()) {
            body.set("tools", tools);
            body.put("tool_choice", "auto");
        }
        // max_completion_tokens rather than max_tokens: the reasoning models refuse the older
        // name, and every current chat model accepts the newer one. Temperature is left unset
        // for the same reason; the system prompt does the work of keeping answers plain.
        body.put("max_completion_tokens", props.getMaxReplyTokens());

        HttpRequest request;
        try {
            request = HttpRequest.newBuilder(URI.create(props.chatUrl()))
                    .timeout(Duration.ofSeconds(props.getTimeoutSeconds()))
                    .header("Content-Type", "application/json")
                    .header("api-key", props.key())
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                    .build();
        } catch (IOException e) {
            throw new KaraboException(KaraboException.Kind.PROVIDER, "Could not build the request", e);
        }

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new KaraboException(KaraboException.Kind.TIMEOUT, "Foundry did not answer in time", e);
        } catch (IOException e) {
            log.warn("Karabo could not reach Foundry at {}: {}", props.chatUrl(), e.getMessage());
            throw new KaraboException(KaraboException.Kind.PROVIDER, "Foundry could not be reached", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new KaraboException(KaraboException.Kind.TIMEOUT, "Interrupted", e);
        }

        if (response.statusCode() / 100 != 2) {
            String snippet = response.body() == null ? ""
                    : response.body().substring(0, Math.min(400, response.body().length()));
            // Azure's content filter answers 400 with a recognisable code. The reader is told the
            // question could not be answered, which is true, rather than that something broke.
            if (snippet.contains("content_filter") || snippet.contains("ResponsibleAIPolicyViolation")) {
                throw new KaraboException(KaraboException.Kind.FILTERED, "Declined by the content filter");
            }
            if (response.statusCode() == 429) {
                log.warn("Foundry is throttling Karabo (429). Raise the deployment's tokens per minute.");
                throw new KaraboException(KaraboException.Kind.RATE_LIMITED, "Foundry throttled the request");
            }
            log.warn("Foundry refused Karabo's request: {} {}", response.statusCode(), snippet);
            throw new KaraboException(KaraboException.Kind.PROVIDER, "Foundry answered " + response.statusCode());
        }

        try {
            JsonNode root = json.readTree(response.body());
            JsonNode choice = root.path("choices").path(0);
            if ("content_filter".equals(choice.path("finish_reason").asText())) {
                throw new KaraboException(KaraboException.Kind.FILTERED, "Answer withheld by the content filter");
            }
            JsonNode message = choice.path("message");
            if (message.isMissingNode()) {
                throw new KaraboException(KaraboException.Kind.PROVIDER, "No message in the response");
            }
            return message;
        } catch (IOException e) {
            throw new KaraboException(KaraboException.Kind.PROVIDER, "Unreadable response", e);
        }
    }
}
