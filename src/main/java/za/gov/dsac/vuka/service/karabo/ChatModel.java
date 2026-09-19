package za.gov.dsac.vuka.service.karabo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;

/**
 * One round with a chat model: the conversation so far and the tools on offer go in, and the
 * model's next message comes out, which is either an answer or a request to call tools.
 *
 * <p>An interface so the tool loop can be tested without a network or a paid deployment. The
 * shapes are the OpenAI chat completions ones, which the Foundry v1 endpoint speaks.
 */
public interface ChatModel {

    /**
     * @param messages the conversation in chat completions form, system prompt first
     * @param tools    the tool definitions, or an empty array for none
     * @return the assistant message: {@code content}, and {@code tool_calls} where it wants data
     */
    JsonNode next(ArrayNode messages, ArrayNode tools);
}
