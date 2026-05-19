# Technical Mapping Report: xAI Responses API ↔ Anthropic Messages API

**Prepared by:** Senior Backend Engineer (20+ years experience)  
**Project Context:** Grok Project – Design and implementation planning for bidirectional translation layers between OpenAI Responses API ↔ Anthropic Messages API, with extension to xAI Responses API.  
**Date:** May 19, 2026  
**Version:** 1.0  
**Status:** Draft for Architecture Review

---

## 1. Executive Summary

xAI’s Responses API (`POST /v1/responses`) is structurally very close to OpenAI’s Responses API — it uses server-managed conversation state via `previous_response_id`, supports built-in agentic tools (web_search, x_search, code_interpreter), custom function calling, structured outputs, and 30-day server-side response storage. 

Anthropic’s Messages API (`POST /v1/messages`) is a mature, client-managed context API with strong tool-use semantics, content blocks, prompt caching, and a distinct streaming event model. It has **no native server-side conversation state**.

**Key Finding for Adapter Design:**  
A high-fidelity mapping is feasible for **portable/custom function calling** and basic text generation. However, **built-in server-side tools** (especially X search) and **state management** represent the largest semantic gaps. These will require either:

- Emulation layers in the adapter (recommended for portability), or
- Explicit "provider capability" flags + graceful degradation.

This report provides detailed field-level mappings, identifies incompatibilities, and proposes architecture patterns that can be shared with the OpenAI Responses ↔ Anthropic Messages translator (since xAI Responses ≈ OpenAI Responses + xAI extensions).

---

## 2. API Philosophy & Design Goals

| Aspect                    | xAI Responses API                              | Anthropic Messages API                          | Implications for Translator |
|---------------------------|------------------------------------------------|-------------------------------------------------|-----------------------------|
| **Core Model**            | Agentic + stateful by default                  | Client-orchestrated, explicit context           | State emulation layer required |
| **Tool Philosophy**       | Hybrid: Server-side built-ins + client functions | Primarily client-executed tools (Computer Use is special) | Built-in tools need shims or capability gating |
| **State**                 | `previous_response_id` + 30-day server store   | Full `messages` history every request + prompt caching | Adapter must implement `ResponseId` → history mapping |
| **Streaming**             | SSE (assumed compatible with OpenAI-style)     | Distinct event types (`message_start`, deltas, `message_stop`) | Event normalizer required |
| **Multimodal**            | Text + image (via content)                     | Rich content blocks (text, image, tool_use, tool_result) | Content block translator |
| **Reasoning Visibility**  | Encrypted thinking traces (opt-in)             | Extended thinking blocks (on supported models)  | Optional passthrough or stripping |
| **Ecosystem Maturity**    | Newer, fast-moving, X-native                   | Very mature, strict schemas, excellent DX       | Use Anthropic as "strict reference" for validation |

**Recommendation:** Treat xAI as an **OpenAI Responses superset** for the core translator. Build xAI-specific extensions on top of the shared OpenAI↔Anthropic core.

---

## 3. Endpoint & Transport Mapping

| xAI                                      | Anthropic                                      | Notes / Adapter Action |
|------------------------------------------|------------------------------------------------|------------------------|
| `POST https://api.x.ai/v1/responses`     | `POST https://api.anthropic.com/v1/messages`   | Direct 1:1 call after translation |
| `GET /responses/{id}`                    | N/A (client reconstructs)                      | Emulate via adapter's history store or return 404 + guidance |
| `DELETE /responses/{id}`                 | N/A                                            | No-op or clear local cache |
| Auth: `Authorization: Bearer $XAI_KEY`   | `x-api-key: $ANTHROPIC_KEY`<br>`anthropic-version: 2023-06-01` (or latest) | Auth translation + header injection in proxy |
| Streaming: SSE                           | SSE with different event names                 | Unified stream event normalizer in adapter |

**Base URL Handling:** Adapter should support provider routing (`xai`, `anthropic`, `openai`) via a single facade or SDK wrapper.

---

## 4. Request Parameter Mapping (Core)

### 4.1 Top-Level Fields

| xAI Field                  | Type          | Anthropic Equivalent          | Mapping Notes / Challenges |
|----------------------------|---------------|-------------------------------|----------------------------|
| `model`                    | string        | `model`                       | Direct. Maintain model alias map (e.g. `grok-4.3` → closest Claude). |
| `input`                    | array         | `messages`                    | See §4.2. Convert roles; extract system prompt. |
| `previous_response_id`     | string        | *(none)*                      | **Critical.** Adapter maintains `Map<response_id, MessageHistory>` or uses external store. On receipt, reconstruct full history and append new `input` messages for Anthropic call. |
| `store`                    | boolean       | *(none)*                      | xAI default `true` (30 days). For Anthropic translation, ignore or log. Adapter can offer its own `store` semantics. |
| `include`                  | array of strings | N/A                        | xAI-specific for `reasoning.encrypted_content`. Strip or map to thinking if available on target. |
| `tools`                    | array         | `tools`                       | See §6. |
| `tool_choice`              | object/string | `tool_choice`                 | Map `auto` / `required` / specific tool. Anthropic uses `{"type": "tool", "name": "..."}` or `auto`. |
| `response_format`          | object        | (via tools or instructions)   | xAI supports `json_schema`. Anthropic: force via tool or system prompt + parsing. Adapter can normalize. |
| `temperature` / `top_p`    | number        | `temperature` / `top_p`       | Direct map (clamping if needed). |
| `max_tokens` / equiv.      | number        | `max_tokens` (required)       | Anthropic **requires** `max_tokens`. Default or infer from xAI if omitted. |
| `stream`                   | boolean       | `stream`                      | Direct. Translate event stream format. |

### 4.2 Message / Input Content Mapping

**xAI `input` structure:**
```json
[
  {"role": "system", "content": "You are Grok..."},
  {"role": "user", "content": "Hello"},
  {"role": "assistant", "content": "Hi there!"}
]
```

**Anthropic `messages` + `system`:**
- System prompt → top-level `system` (string or array of text blocks) **or** first message with `role: "assistant"`? (Best practice: use top-level `system`).
- Strict alternation: user → assistant → user...
- Content can be string **or** array of blocks: `[{"type": "text", "text": "..."}, {"type": "image", ...}]`

**Adapter Rules:**
1. Extract any `role: "system"` from xAI `input` → Anthropic `system`.
2. Filter remaining to `messages`.
3. Ensure strict user/assistant alternation (merge consecutive same-role if needed, though rare).
4. Convert simple string `content` → `[{ "type": "text", "text": content }]`.
5. Preserve `tool_use` / `tool_result` blocks when present in continued conversations.

---

## 5. State Management & Conversation Continuity (Critical Section)

This is the **largest architectural difference**.

**xAI Behavior:**
- `previous_response_id` tells server to load prior context + reasoning.
- Only send *new* messages in `input`.
- Responses stored 30 days server-side.

**Anthropic Behavior:**
- Always send **complete** message history.
- Use `prompt caching` (beta) on long prefixes for cost/latency wins.

**Adapter Design Recommendation (for this project):**

Implement a **ConversationStateManager** service (shared across OpenAI/xAI ↔ Anthropic translators):

```typescript
interface ConversationStateManager {
  // When xAI-style request arrives with previous_response_id
  getOrCreateHistory(responseId?: string, newMessages?: Message[]): MessageHistory;
  
  // After Anthropic call, generate a synthetic response_id for client to use next time
  createResponseId(history: MessageHistory): string;
  
  // Optional: persist to Redis/DB with TTL (mimic 30-day)
  store(history: MessageHistory, ttlDays?: number): Promise<void>;
}
```

- For pure stateless clients: require full history on every call (document the limitation).
- For stateful experience: the adapter issues its own `response_id`s and manages the mapping internally.
- When translating *to* xAI from Anthropic, the adapter can choose to use `previous_response_id` when it detects repeated history (optimization).

This pattern can be reused for the OpenAI Responses side (which also supports `previous_response_id`).

---

## 6. Tool Calling Mapping

### 6.1 Custom Function Tools (Portable)

**xAI → Anthropic:**
- `tools: [{ type: "function", function: { name, description, parameters: JSONSchema } }]`
  → Anthropic: `tools: [{ name, description, input_schema: JSONSchema }]`

- Tool call in response: xAI likely returns in output or dedicated field.
  Anthropic returns `content` block with `type: "tool_use"`, `id`, `name`, `input`.

- Client then sends `tool_result` back (as new message or in next turn).

**Mapping is straightforward** for this direction. Bidirectional also good.

### 6.2 Built-in Server Tools (xAI-specific)

| xAI Built-in Tool     | Description                  | Anthropic Equivalent                  | Recommended Handling in Adapter |
|-----------------------|------------------------------|---------------------------------------|---------------------------------|
| `web_search`          | Server-side web search       | None native (client must provide)     | Option A: Error if used.<br>Option B: Shim using external search (Tavily, Brave, etc.) + inject `tool_result`. Complex for streaming. |
| `x_search`            | X/Twitter search             | None                                  | **Non-portable.** Document as xAI-only capability. |
| `code_interpreter`    | Server Python sandbox        | None (client can use their own)       | Shim possible but security/sandbox differences. |
| `collections_search`  | Uploaded docs                | N/A                                   | Provider-specific. |

**Strong Recommendation for Project:**
- Expose a `capabilities` or `supported_tools` metadata endpoint per provider.
- In the unified client/SDK, mark built-in tools as `provider: "xai"` only.
- For maximum portability, encourage clients to use **custom function tools** + their own search/code execution for cross-provider code.

---

## 7. Streaming & Event Structure

Both use Server-Sent Events, but formats differ significantly.

**xAI (inferred from OpenAI influence):**
- Likely `data: {"type": "response.created", ...}`, deltas for text/tool calls, etc.

**Anthropic:**
- `event: message_start`
- `event: content_block_start` / `content_block_delta` (with `delta.type: "text_delta"` or `input_json_delta`)
- `event: message_delta`
- `event: message_stop`
- Usage in final `message_delta` or separate.

**Adapter Requirement:**
Build a **Stream Normalizer** that can:
- Consume either format.
- Emit a canonical stream of events (e.g., `{type: "text", content}`, `{type: "tool_call", ...}`, `{type: "usage", ...}`).
- Or support "pass-through" mode for advanced clients.

This normalizer will be reusable for OpenAI Responses streaming as well.

---

## 8. Other Notable Differences & Edge Cases

- **Encrypted Reasoning (xAI):** `include: ["reasoning.encrypted_content"]` . Anthropic has thinking blocks on certain models. Map or drop based on config.
- **Structured Outputs:** xAI `response_format.json_schema` → Anthropic can approximate via tool with strict schema or system instructions + post-processing.
- **Max tool calls / parallelism:** Anthropic supports parallel tool use in one response. xAI likely does too via agentic loop.
- **Token Usage:** Both return usage; normalize `input_tokens` / `output_tokens` / `cache_read` etc.
- **Error Codes:** Map HTTP errors + provider-specific error bodies to common error types.
- **Rate Limits:** Headers differ (`anthropic-ratelimit-*` vs xAI). Normalize in proxy.

---

## 9. Proposed Architecture for the Translation Layer

Given the project goal (OpenAI Responses ↔ Anthropic Messages, now + xAI):

```
Client (or unified SDK)
        ↓
Provider Router / Facade
        ↓
Translation Core (Canonical Internal Model)
   ├── OpenAI Responses Adapter
   ├── xAI Responses Adapter  (extends OpenAI adapter + xAI extensions)
   └── Anthropic Messages Adapter
        ↓
State Manager (ResponseId ↔ History + optional persistence)
        ↓
Tool Router (portable functions vs provider built-ins)
        ↓
Actual Provider SDK / HTTP calls
```

**Shared Components to Build:**
1. `CanonicalMessage`, `CanonicalTool`, `CanonicalResponse` types.
2. `ConversationStateManager` service (with pluggable storage: in-memory, Redis, Postgres).
3. `StreamEventNormalizer`.
4. `ToolCallTranslator` + capability registry.
5. Config-driven model mapping + fallback rules.
6. Observability: token usage, latency, error classification per provider.

This design allows adding more providers (Gemini, etc.) later with minimal duplication.

---

## 10. Implementation Roadmap & Risks

**Phase 1 (MVP):** Text + custom function calling + basic state emulation (no built-ins).  
**Phase 2:** Streaming normalization + prompt caching integration on Anthropic side.  
**Phase 3:** Built-in tool shims (web search) + structured output normalization.  
**Phase 4:** Encrypted reasoning / thinking passthrough + advanced agentic patterns.

**Top Risks:**
- **State consistency** across providers (especially with `store: false` or long-running agents).
- **Built-in tool fidelity** — may never be perfect; manage expectations.
- **Streaming correctness** under tool-calling loops.
- **Cost/latency overhead** of adapter (history reconstruction, extra calls for shims).

**Mitigation:** Comprehensive test harness with golden request/response pairs for each provider pair. Include chaos tests for state recovery.

---

## 11. Sample Translation Snippet (Conceptual)

**xAI Request (stateful + tool):**
```json
{
  "model": "grok-4.3",
  "previous_response_id": "rs_abc123",
  "input": [{"role": "user", "content": "Latest on xAI?"}],
  "tools": [{"type": "web_search"}, {"type": "x_search"}]
}
```

**Translated Anthropic Request (adapter fills history + converts tools):**
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 4096,
  "system": "You are Grok...",
  "messages": [ /* full reconstructed history + new user message */ ],
  "tools": [
    {
      "name": "web_search",
      "description": "Search the web (emulated)",
      "input_schema": { "type": "object", "properties": {"query": {"type": "string"}} }
    }
    // Note: x_search omitted or marked unavailable
  ]
}
```

The adapter would then handle tool execution loop if emulating, or return tool_use for client to handle.

---

## 12. Conclusion & Next Steps

xAI Responses API maps reasonably well to Anthropic Messages for core chat + custom tools use cases, especially when the adapter owns state management. The biggest value-add of this mapping exercise is confirming that the **shared translation core** designed for OpenAI Responses ↔ Anthropic can be extended cleanly for xAI with relatively low incremental effort.

**Immediate Next Steps:**
1. Finalize Canonical types + StateManager interface.
2. Implement first-pass request translator (text + custom tools).
3. Build test matrix covering state continuation, tool calling, and streaming.
4. Document provider capability matrix for clients.
5. Review with team on built-in tool strategy (shim vs capability flag).

This mapping strengthens the overall vision of a provider-agnostic, future-proof agent API layer.

---

**Appendix A: Quick Reference Table (Selected Fields)**

(Truncated for brevity in this draft; full spreadsheet available in repo.)

**Appendix B: References**
- xAI Docs: https://docs.x.ai (Responses API, Tools)
- Anthropic Messages API Reference
- Provided `xaiVsOpenAI.md` for baseline comparison
- Internal project requirements for OpenAI Responses ↔ Anthropic bridge

---

*End of Report*

**Prepared for architecture review and implementation planning.**  
Feedback welcome on state management approach and built-in tool handling strategy.