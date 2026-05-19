import type { XAIResponse, XAIOutputItem } from "../../types/xai.js";
import type { AnthropicResponse, AnthropicContentBlock, AnthropicTextBlock, AnthropicToolUseBlock, AnthropicUsage } from "../../types/anthropic.js";

export function xaiResponseToAnthropic(
  xaiRes: XAIResponse,
  model: string
): AnthropicResponse {
  const content = xaiOutputToAnthropicBlocks(xaiRes.output);
  const usage = xaiUsageToAnthropic(xaiRes.usage);
  const stop_reason = inferStopReason(xaiRes.output, xaiRes.status);

  return {
    id: xaiRes.id.startsWith("msg_") ? xaiRes.id : `msg_${xaiRes.id.slice(3)}`,
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason,
    stop_sequence: null,
    usage,
  };
}

function xaiOutputToAnthropicBlocks(
  output: XAIOutputItem[]
): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [];

  for (const item of output) {
    if (item.type === "message") {
      const block: AnthropicTextBlock = {
        type: "text",
        text: typeof item.content === "string"
          ? item.content
          : item.content.map((p) => ("text" in p ? p.text : "")).join(""),
      };
      blocks.push(block);
    } else if (item.type === "function_call") {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(item.arguments);
      } catch {
        input = { _raw: item.arguments };
      }
      const block: AnthropicToolUseBlock = {
        type: "tool_use",
        id: item.call_id || item.id,
        name: item.name,
        input,
      };
      blocks.push(block);
    }
  }

  return blocks;
}

function xaiUsageToAnthropic(
  usage: XAIResponse["usage"]
): AnthropicUsage {
  if (!usage) {
    return { input_tokens: 0, output_tokens: 0 };
  }
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  };
}

function inferStopReason(
  output: XAIOutputItem[],
  status: string
): AnthropicResponse["stop_reason"] {
  if (status === "incomplete") return "max_tokens";
  const hasToolCall = output.some((item) => item.type === "function_call");
  if (hasToolCall) return "tool_use";
  return "end_turn";
}
