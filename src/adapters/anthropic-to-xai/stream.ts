import type { SSEEvent } from "../../services/stream-relay.js";

/**
 * Translate XAI SSE streaming events to Anthropic SSE streaming events.
 *
 * XAI event flow:
 *   response.created → response.in_progress → response.output_item.added*
 *   → response.output_text.delta* / response.function_call_arguments.delta*
 *   → response.output_text.done* / response.function_call_arguments.done*
 *   → response.output_item.done* → response.completed
 *
 * Anthropic event flow:
 *   message_start → content_block_start* → content_block_delta* → content_block_stop*
 *   → message_delta → message_stop
 */

interface XaiStreamState {
  messageId: string;
  model: string;
  started: boolean;
  contentBlockIndex: number;
  textBlockOpen: boolean;
  toolBlockOpen: boolean;
  inputTokens: number;
  outputTokens: number;
}

function createInitialXaiState(): XaiStreamState {
  return {
    messageId: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    model: "",
    started: false,
    contentBlockIndex: 0,
    textBlockOpen: false,
    toolBlockOpen: false,
    inputTokens: 0,
    outputTokens: 0,
  };
}

export function createXaiToAnthropicStreamTranslator(): (
  event: SSEEvent
) => SSEEvent | SSEEvent[] | null {
  const state = createInitialXaiState();

  return function translate(event: SSEEvent): SSEEvent | SSEEvent[] | null {
    try {
      const parsed = JSON.parse(event.data);
      const type = parsed.type;

      switch (type) {
        case "response.created":
        case "response.in_progress": {
          if (!state.started) {
            state.started = true;
            state.model = parsed.response?.model ?? "";
            state.inputTokens = parsed.response?.usage?.input_tokens ?? 0;

            return {
              data: JSON.stringify({
                type: "message_start",
                message: {
                  id: state.messageId,
                  type: "message",
                  role: "assistant",
                  model: state.model,
                  content: [],
                  usage: {
                    input_tokens: state.inputTokens,
                    output_tokens: 0,
                  },
                },
              }),
            };
          }
          return null;
        }

        case "response.output_item.added": {
          const item = parsed.item;
          const idx = state.contentBlockIndex++;

          if (item?.type === "message") {
            state.textBlockOpen = true;
            return {
              data: JSON.stringify({
                type: "content_block_start",
                index: idx,
                content_block: {
                  type: "text",
                  text: "",
                },
              }),
            };
          }

          if (item?.type === "function_call") {
            state.toolBlockOpen = true;
            return {
              data: JSON.stringify({
                type: "content_block_start",
                index: idx,
                content_block: {
                  type: "tool_use",
                  id: item.call_id ?? item.id ?? "",
                  name: item.name ?? "",
                  input: {},
                },
              }),
            };
          }

          return null;
        }

        case "response.output_text.delta": {
          if (!state.textBlockOpen) return null;
          return {
            data: JSON.stringify({
              type: "content_block_delta",
              index: state.contentBlockIndex - 1,
              delta: {
                type: "text_delta",
                text: parsed.delta ?? "",
              },
            }),
          };
        }

        case "response.function_call_arguments.delta": {
          if (!state.toolBlockOpen) return null;
          return {
            data: JSON.stringify({
              type: "content_block_delta",
              index: state.contentBlockIndex - 1,
              delta: {
                type: "input_json_delta",
                partial_json: parsed.delta ?? "",
              },
            }),
          };
        }

        case "response.output_text.done":
        case "response.function_call_arguments.done": {
          return {
            data: JSON.stringify({
              type: "content_block_stop",
              index: state.contentBlockIndex - 1,
            }),
          };
        }

        case "response.output_item.done": {
          // In Anthropic, content_block_stop already handles the block end
          state.textBlockOpen = false;
          state.toolBlockOpen = false;
          return null;
        }

        case "response.completed": {
          state.outputTokens =
            parsed.response?.usage?.output_tokens ?? 0;

          const events: SSEEvent[] = [
            {
              data: JSON.stringify({
                type: "message_delta",
                delta: {
                  stop_reason: "end_turn",
                  stop_sequence: null,
                },
                usage: {
                  output_tokens: state.outputTokens,
                },
              }),
            },
            {
              data: JSON.stringify({
                type: "message_stop",
              }),
            },
          ];

          return events;
        }

        case "response.failed":
        case "error": {
          return {
            data: JSON.stringify({
              type: "error",
              error: {
                type: parsed.code ?? "upstream_error",
                message: parsed.message ?? "Upstream request failed",
              },
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
