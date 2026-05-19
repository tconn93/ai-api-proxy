import type { AnthropicRequest, AnthropicMessage, AnthropicContentBlock, AnthropicTool } from "../../types/anthropic.js";
import type { XAIRequest, XAIInputItem } from "../../types/xai.js";
import { mapModel } from "../../config/model-map.js";
import { anthropicToolToXaiFunction } from "../shared/tools.js";
import { anthropicBlocksToXaiContent } from "../shared/content-blocks.js";

export function anthropicRequestToXai(
  anthropicReq: AnthropicRequest
): XAIRequest {
  const input: XAIInputItem[] = [];

  // 1. Convert system to a system message in the input array
  const system = anthropicReq.system;
  if (system) {
    const systemContent = typeof system === "string"
      ? system
      : (system as { type: string; text?: string }[])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n");
    if (systemContent) {
      input.push({ role: "system", content: systemContent });
    }
  }

  // 2. Convert messages to XAI input items
  for (const msg of anthropicReq.messages) {
    const item = anthropicMessageToXaiItem(msg);
    if (item) input.push(item);
  }

  // 3. Translate tools
  const tools = anthropicReq.tools?.map(anthropicToolToXaiFunction);

  // 4. Map model
  const model = mapModel(anthropicReq.model, "anthropic-to-xai");

  // 5. Map tool_choice
  const tool_choice = translateToolChoice(anthropicReq.tool_choice);

  const xaiReq: XAIRequest = {
    model,
    input,
    max_output_tokens: anthropicReq.max_tokens,
    stream: anthropicReq.stream,
    temperature: anthropicReq.temperature,
    top_p: anthropicReq.top_p,
  };

  if (tools && tools.length > 0) xaiReq.tools = tools;
  if (tool_choice) xaiReq.tool_choice = tool_choice;

  return xaiReq;
}

function anthropicMessageToXaiItem(
  msg: AnthropicMessage
): XAIInputItem | null {
  if (typeof msg.content === "string") {
    return { role: msg.role, content: msg.content };
  }

  // Check if this is a tool_result message
  const toolResults = msg.content.filter(
    (b): b is AnthropicContentBlock & { type: "tool_result" } =>
      b.type === "tool_result"
  );

  if (toolResults.length > 0) {
    // Return tool results as individual function_call_output items
    // For simplicity, return the first tool result as a function_call_output
    const tr = toolResults[0];
    return {
      type: "function_call_output",
      call_id: tr.tool_use_id,
      output: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
    };
  }

  // Regular message with content blocks
  return {
    role: msg.role,
    content: anthropicBlocksToXaiContent(msg.content),
  };
}

function translateToolChoice(
  tc: AnthropicRequest["tool_choice"]
): XAIRequest["tool_choice"] {
  if (!tc) return undefined;
  if (tc.type === "auto") return "auto";
  if (tc.type === "any") return "required";
  if (tc.type === "tool") return { type: "function", function: { name: tc.name } };
  return undefined;
}
