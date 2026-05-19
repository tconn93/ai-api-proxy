import type { AnthropicResponse, AnthropicContentBlock } from "../../types/anthropic.js";
import type { XAIResponse, XAIOutputItem, XAIUsage } from "../../types/xai.js";

export function anthropicResponseToXai(
  anthropicRes: AnthropicResponse,
  responseId: string,
  model: string
): XAIResponse {
  const output = contentBlocksToXaiOutput(anthropicRes.content);
  const usage = anthropicUsageToXai(anthropicRes.usage);

  return {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    output,
    usage,
    status: mapStopReason(anthropicRes.stop_reason),
  };
}

function contentBlocksToXaiOutput(blocks: AnthropicContentBlock[]): XAIOutputItem[] {
  const output: XAIOutputItem[] = [];
  let messageContent = "";

  for (const block of blocks) {
    if (block.type === "text") {
      messageContent += block.text;
    } else if (block.type === "tool_use") {
      output.push({
        type: "function_call",
        id: block.id,
        call_id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
        status: "completed",
      });
    }
  }

  // Add text message if any text content
  if (messageContent) {
    output.push({
      type: "message",
      id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
      role: "assistant",
      content: messageContent,
      status: "completed",
    });
  }

  // If no content at all, add empty message
  if (output.length === 0) {
    output.push({
      type: "message",
      id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
      role: "assistant",
      content: "",
      status: "completed",
    });
  }

  return output;
}

function anthropicUsageToXai(usage: AnthropicResponse["usage"]): XAIUsage {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens:
      usage.input_tokens +
      usage.output_tokens +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0),
  };
}

function mapStopReason(
  reason: AnthropicResponse["stop_reason"]
): XAIResponse["status"] {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "completed";
    case "max_tokens":
      return "incomplete";
    case "tool_use":
      return "completed";
    default:
      return "completed";
  }
}
