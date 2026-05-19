import type { SSEEvent } from "../../services/stream-relay.js";

/**
 * Translate Anthropic SSE streaming events to XAI SSE streaming events.
 *
 * Anthropic event flow:
 *   message_start → content_block_start* → content_block_delta* → content_block_stop*
 *   → message_delta → message_stop
 *
 * XAI event flow:
 *   response.created → response.in_progress → response.output_item.added*
 *   → response.output_text.delta* / response.function_call_arguments.delta*
 *   → response.output_text.done* / response.function_call_arguments.done*
 *   → response.output_item.done* → response.completed
 */

interface StreamState {
  messageId: string;
  model: string;
  responseId: string;
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  currentToolName: string;
  currentToolArgs: string;
  started: boolean;
  textStarted: boolean;
  toolStarted: boolean;
  inputTokens: number;
  outputTokens: number;
}

function createInitialState(): StreamState {
  return {
    messageId: "",
    model: "",
    responseId: `rs_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    itemId: "",
    outputIndex: 0,
    contentIndex: 0,
    currentToolName: "",
    currentToolArgs: "",
    started: false,
    textStarted: false,
    toolStarted: false,
    inputTokens: 0,
    outputTokens: 0,
  };
}

export function createAnthropicToXaiStreamTranslator(): (
  event: SSEEvent
) => SSEEvent | SSEEvent[] | null {
  const state = createInitialState();

  return function translate(event: SSEEvent): SSEEvent | SSEEvent[] | null {
    try {
      const parsed = JSON.parse(event.data);
      const type = parsed.type;

      switch (type) {
        case "message_start": {
          state.started = true;
          state.messageId = parsed.message?.id ?? "";
          state.model = parsed.message?.model ?? "";
          state.inputTokens = parsed.message?.usage?.input_tokens ?? 0;
          state.itemId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

          return {
            data: JSON.stringify({
              type: "response.created",
              response: {
                id: state.responseId,
                object: "response",
                created_at: Math.floor(Date.now() / 1000),
                model: state.model,
                output: [],
                status: "in_progress",
              },
            }),
          };
        }

        case "content_block_start": {
          const block = parsed.content_block;
          state.contentIndex = parsed.index ?? 0;

          if (block?.type === "text") {
            state.textStarted = true;
            return {
              data: JSON.stringify({
                type: "response.output_item.added",
                output_index: state.outputIndex,
                item: {
                  type: "message",
                  id: state.itemId,
                  role: "assistant",
                  content: "",
                  status: "in_progress",
                },
              }),
            };
          }

          if (block?.type === "tool_use") {
            state.toolStarted = true;
            state.currentToolName = block.name ?? "";
            state.currentToolArgs = "";
            const toolItemId = `fc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

            return {
              data: JSON.stringify({
                type: "response.output_item.added",
                output_index: state.outputIndex,
                item: {
                  type: "function_call",
                  id: toolItemId,
                  call_id: block.id ?? toolItemId,
                  name: block.name ?? "",
                  arguments: "",
                  status: "in_progress",
                },
              }),
            };
          }

          return null;
        }

        case "content_block_delta": {
          const delta = parsed.delta;

          if (delta?.type === "text_delta" && state.textStarted) {
            return {
              data: JSON.stringify({
                type: "response.output_text.delta",
                item_id: state.itemId,
                output_index: state.outputIndex,
                content_index: state.contentIndex,
                delta: delta.text ?? "",
              }),
            };
          }

          if (delta?.type === "input_json_delta" && state.toolStarted) {
            state.currentToolArgs += delta.partial_json ?? "";
            return {
              data: JSON.stringify({
                type: "response.function_call_arguments.delta",
                item_id: state.itemId,
                output_index: state.outputIndex,
                delta: delta.partial_json ?? "",
              }),
            };
          }

          return null;
        }

        case "content_block_stop": {
          if (state.textStarted) {
            state.textStarted = false;
            // Note: we don't have the full text accumulated; the done event would need it
            // For now, this is a simplification
            return null;
          }

          if (state.toolStarted) {
            state.toolStarted = false;
            return {
              data: JSON.stringify({
                type: "response.function_call_arguments.done",
                item_id: state.itemId,
                output_index: state.outputIndex,
                name: state.currentToolName,
                arguments: state.currentToolArgs,
              }),
            };
          }

          return null;
        }

        case "message_delta": {
          state.outputTokens = parsed.usage?.output_tokens ?? 0;
          return null;
        }

        case "message_stop": {
          return {
            data: JSON.stringify({
              type: "response.completed",
              response: {
                id: state.responseId,
                object: "response",
                created_at: Math.floor(Date.now() / 1000),
                model: state.model,
                output: [],
                usage: {
                  input_tokens: state.inputTokens,
                  output_tokens: state.outputTokens,
                  total_tokens: state.inputTokens + state.outputTokens,
                },
                status: "completed",
              },
            }),
          };
        }

        case "error": {
          return {
            data: JSON.stringify({
              type: "error",
              code: parsed.error?.type ?? "upstream_error",
              message: parsed.error?.message ?? "Unknown upstream error",
            }),
          };
        }

        default:
          return null;
      }
    } catch {
      return null;
    }
  };
}
