package za.gov.dsac.vuka.service.microsoft;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.util.List;
import java.util.Map;

/**
 * Puts the deadline countdown where the work already happens: the entity's Teams channel.
 *
 * <h2>Why a webhook and not the Graph messaging API</h2>
 *
 * Posting a channel message through Graph needs {@code ChannelMessage.Send}, which Microsoft
 * classes as a protected API: an application cannot get it by asking, it goes through a request
 * process with Microsoft, and it is a large permission to hold over a department's Teams estate
 * for the sake of a reminder. A channel workflow gives one URL that posts to one channel and
 * nothing else, the channel owner creates it themselves in about a minute, and it can be revoked
 * by deleting the workflow. For a notification, that is both the smaller permission and the
 * faster thing to set up in a hackathon, and it is the recommendation to keep afterwards.
 *
 * <p>The payload is an Adaptive Card wrapped the way the Teams "Post to a channel when a webhook
 * request is received" workflow expects. Not the older {@code MessageCard} shape: Office 365
 * connectors in Teams are being retired, and building the new integration on the retired thing
 * would be a maintenance problem handed straight to the department.
 *
 * <h2>The URL is a credential</h2>
 *
 * Anyone holding the webhook URL can post into that channel. It is stored on the workspace, never
 * returned by any API, and never written to a log line, which is why failures here log the entity
 * and the status and not the address.
 */
@Service
public class TeamsNotifier {

    private static final Logger log = LoggerFactory.getLogger(TeamsNotifier.class);

    private final RestClient http = RestClient.builder().build();
    private final ObjectMapper json = new ObjectMapper();

    /**
     * Posts a card. Returns false rather than throwing: a reminder that could not be delivered
     * must not take down the run that was about to remind twenty-seven other entities.
     *
     * @param webhookUrl the channel workflow URL, or null to do nothing
     * @param title      the heading, e.g. "Q1 2026/27 is due in 15 days"
     * @param body       one paragraph of plain text
     * @param facts      label to value pairs shown as a table under the body
     * @param linkText   label for the button, or null for no button
     * @param linkUrl    where the button goes
     */
    public boolean post(String webhookUrl, String title, String body,
                        Map<String, String> facts, String linkText, String linkUrl) {
        if (webhookUrl == null || webhookUrl.isBlank()) return false;
        try {
            http.post()
                .uri(URI.create(webhookUrl))
                .contentType(MediaType.APPLICATION_JSON)
                .body(card(title, body, facts, linkText, linkUrl))
                .retrieve()
                .toBodilessEntity();
            return true;
        } catch (Exception e) {
            // Deliberately no URL in the message: it is a capability and logs get shared.
            log.warn("Teams post failed: {}", e.getMessage());
            return false;
        }
    }

    /** The Adaptive Card, built as a tree rather than as a format string so a value cannot break the JSON. */
    String card(String title, String body, Map<String, String> facts, String linkText, String linkUrl) {
        ObjectNode content = json.createObjectNode();
        content.put("$schema", "http://adaptivecards.io/schemas/adaptive-card.json");
        content.put("type", "AdaptiveCard");
        content.put("version", "1.4");

        ArrayNode blocks = content.putArray("body");
        ObjectNode heading = blocks.addObject();
        heading.put("type", "TextBlock");
        heading.put("text", title);
        heading.put("weight", "Bolder");
        heading.put("size", "Medium");
        heading.put("wrap", true);

        ObjectNode paragraph = blocks.addObject();
        paragraph.put("type", "TextBlock");
        paragraph.put("text", body);
        paragraph.put("wrap", true);

        if (facts != null && !facts.isEmpty()) {
            ObjectNode factSet = blocks.addObject();
            factSet.put("type", "FactSet");
            ArrayNode list = factSet.putArray("facts");
            facts.forEach((k, v) -> {
                ObjectNode fact = list.addObject();
                fact.put("title", k);
                fact.put("value", v == null ? "" : v);
            });
        }

        if (linkText != null && linkUrl != null) {
            ArrayNode actions = content.putArray("actions");
            ObjectNode open = actions.addObject();
            open.put("type", "Action.OpenUrl");
            open.put("title", linkText);
            open.put("url", linkUrl);
        }

        ObjectNode attachment = json.createObjectNode();
        attachment.put("contentType", "application/vnd.microsoft.card.adaptive");
        attachment.putNull("contentUrl");
        attachment.set("content", content);

        ObjectNode message = json.createObjectNode();
        message.put("type", "message");
        message.set("attachments", json.createArrayNode().add(attachment));
        return message.toString();
    }

    /** Convenience for the common case of a card with no button. */
    public boolean post(String webhookUrl, String title, String body, Map<String, String> facts) {
        return post(webhookUrl, title, body, facts, null, null);
    }

    /** Kept so callers can pass an ordered, possibly empty set of facts without a null check. */
    public static Map<String, String> facts(List<Map.Entry<String, String>> entries) {
        return entries.stream().collect(
                java.util.LinkedHashMap::new,
                (m, e) -> m.put(e.getKey(), e.getValue()),
                java.util.LinkedHashMap::putAll);
    }
}
