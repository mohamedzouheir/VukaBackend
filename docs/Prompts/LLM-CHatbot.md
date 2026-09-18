TASK
Wire the "Karabo" chat panel in my existing Vuka web app to a real LLM hosted on Microsoft Foundry (Azure OpenAI). Karabo currently shows a "not connected yet" design state. I want it to answer real questions using the app's own data.

FIRST, INSPECT THE PROJECT
Before changing anything, read the repo and tell me:
- the frontend framework and folder structure (it runs on Vite at localhost:5173)
- whether a backend already exists, and where
- where the Karabo chat panel component lives
- where the data lives (allocations, targets, reported figures, evidence, confirmations) and how it is accessed (MySQL, an existing API, mock data, etc.)
Then follow the existing conventions (naming, folder layout, module system, styling). Do not restructure anything unrelated.

CONTEXT
- App: Vuka, a public-facing portal for the Department of Sport, Arts and Culture (South Africa). UI is in isiZulu with some English.
- Karabo's promise: "Ask me about any body the Department funds, in ordinary words, and I will answer with the figure and where it came from."
- Suggested questions already in the UI: "Which entities are late this quarter?", "What was Iziko allocated this year?", "Why is Robben Island scored critical?", "Show me figures with no evidence attached".
- Model provider: Microsoft Foundry project resource. Use the Azure OpenAI v1-compatible endpoint with the official "openai" npm package.

REQUIREMENTS

1. Security
- The API key must NEVER appear in frontend code or the browser bundle. Only the backend reads it.
- Read config from environment variables: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_DEPLOYMENT_NAME. Create a .env.example with placeholders only, and make sure .env is in .gitignore.
- Add a POST /api/chat route on the backend. The frontend calls only this route.
- Add rate limiting (express-rate-limit or equivalent), a maximum message length, and a cap on how much history is accepted.
- Validate the request body. Return clean error messages, never raw stack traces or provider errors.
- Reuse the app's existing auth or session check on this route if one exists. If none exists, add a clear TODO and a simple placeholder.

2. Backend behaviour
- Use the OpenAI client with baseURL set to `${AZURE_OPENAI_ENDPOINT}/openai/v1/` and model set to the deployment name.
- System prompt for Karabo: plain, ordinary words; always state the figure AND its source; answer only from data returned by tools or context; if the data does not contain the answer, say so; never invent figures; keep answers short; reply in the language the user wrote in (isiZulu or English).
- Use tool/function calling so the model can query my real data instead of guessing. Create tools that map to my existing data layer, for example:
  - get_entity_allocation(entity_name, financial_year)
  - list_late_entities(quarter)
  - get_entity_risk_score(entity_name) including the reasons behind the score
  - list_figures_without_evidence()
  Adjust the tool list to match what my database and API actually contain. All database queries must be parameterised (no string concatenation).
- Run the tool loop on the server: model requests a tool, server executes it, result goes back to the model, repeat until a final answer (limit to 5 iterations).
- Return JSON: { reply: string, sources: [{ label, reference }] } so the UI can display where each figure came from.

3. Frontend
- Replace the "not connected yet" behaviour in the Karabo panel with a real call to /api/chat.
- Keep the existing design, colours, fonts and layout. Do not redesign.
- Show a typing/loading indicator while waiting, disable the send button during a request, and show a friendly error message if the request fails.
- Keep conversation history in component state and send the last few turns with each request.
- Make the four suggested-question chips send the question when clicked.
- Show the sources under each reply if returned.
- Update the panel's intro text and footer note that currently say no model is connected.
- Use an environment-based API base URL (Vite env variable such as VITE_API_BASE_URL), not a hard-coded localhost address.

4. Configuration and dev experience
- Add CORS restricted to http://localhost:5173 in development and a configurable origin for production.
- Add npm scripts to run frontend and backend together in development if that is not already set up.
- If the app is deployed on a VPS, note anything needed for production (reverse proxy path for /api, process manager, env vars on the server).

OUTPUT FORMAT
- Give me the complete updated version of every file you change or create, not partial snippets, with the file path above each one.
- List the exact npm install commands to run.
- End with a short checklist to test it: one question per suggested chip, one question the data cannot answer (Karabo must say it does not know), and one attempt to confirm the API key is not visible in the browser network tab or source.

DO NOT
- Put the key in any client-side file or commit it.
- Let the model answer from general knowledge when the data is missing.
- Change unrelated files or existing behaviour.