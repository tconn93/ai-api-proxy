import type { XAIRequest, XAIInputItem } from "../../types/xai.js";
import type { AnthropicRequest, AnthropicMessage, AnthropicContentBlock } from "../../types/anthropic.js";
import type { NormalizedMessage } from "../../types/shared.js";
import { mapModel } from "../../config/model-map.js";
import {
  extractSystemMessages,
  systemMessagesToString,
  ensureAlternation,
  normalizeContent,
} from "../shared/messages.js";
import { translateXaiToolsToAnthropic } from "../shared/tools.js";
import { xaiContentToAnthropicBlocks } from "../shared/content-blocks.js";

export interface XaiToAnthropicResult {
  request: AnthropicRequest;
  warnings: string[];
  normalizedMessages: NormalizedMessage[];
}

export function xaiRequestToAnthropic(
  xaiReq: XAIRequest,
  previousHistory: NormalizedMessage[],
  defaultMaxTokens: number
): XaiToAnthropicResult {
  const warnings: string[] = [];

  // 1. Extract system messages
  const { systemMessages } = extractSystemMessages(xaiReq.input);
  const system = systemMessages.length > 0
    ? systemMessagesToString(systemMessages)
    : xaiReq.instructions || undefined;

  // 2. Build messages: previous history + new non-system input
  const nonSystemInput = xaiReq.input.filter((item) => {
    if ("role" in item && item.role === "system") return false;
    return true;
  });

  const newMessages = xaiInputToAnthropicMessages(nonSystemInput);
  const allMessages = [...previousHistoryToMessages(previousHistory), ...newMessages];
  const messages = ensureAlternation(allMessages);

  // 3. Translate tools
  const { tools, warnings: toolWarnings } = translateXaiToolsToAnthropic(
    xaiReq.tools
  );
  warnings.push(...toolWarnings);

  // 4. Map model
  const model = mapModel(xaiReq.model, "xai-to-anthropic");

  // 5. Ensure max_tokens
  const max_tokens = xaiReq.max_output_tokens ?? defaultMaxTokens;

  // 6. Map tool_choice
  const tool_choice = translateToolChoice(xaiReq.tool_choice);

  const anthropicReq: AnthropicRequest = {
    model,
    messages,
    max_tokens,
    stream: xaiReq.stream,
    temperature: xaiReq.temperature,
    top_p: xaiReq.top_p,
  };

  if (system) anthropicReq.system = system;
  if (tools.length > 0) anthropicReq.tools = tools;
  if (tool_choice) anthropicReq.tool_choice = tool_choice;
  if (xaiReq.top_p !== undefined) anthropicReq.top_p = xaiReq.top_p;

  // Build normalized messages for state storage
  const normalizedMessages: NormalizedMessage[] = [
    ...previousHistory,
    ...nonSystemInput.map(xaiItemToNormalized),
  ];

  return { request: anthropicReq, warnings, normalizedMessages };
}

function xaiInputToAnthropicMessages(
  items: XAIInputItem[]
): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  for (const item of items) {
    if ("type" in item && item.type === "function_call_output") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: item.call_id,
            content: item.output,
          },
        ],
      });
      continue;
    }

    if (!("role" in item)) continue;

    const role = item.role === "developer" ? "user" : item.role;

    if (role === "system") continue; // already extracted

    if (role === "user" || role === "assistant") {
      const content: AnthropicContentBlock[] =
        typeof item.content === "string"
          ? xaiContentToAnthropicBlocks(item.content)
          : xaiContentToAnthropicBlocks(item.content);

      // If assistant has tool calls in content, preserve them
      // (handled when reconstructing from stored history)

      messages.push({ role, content } as AnthropicMessage);
    }
  }

  return messages;
}

function previousHistoryToMessages(
  history: NormalizedMessage[]
): AnthropicMessage[] {
  return history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: normalizeContent(
        typeof m.content === "string"
          ? m.content
          : m.content as AnthropicContentBlock[]
      ),
    }));
}

function xaiItemToNormalized(item: XAIInputItem): NormalizedMessage {
  if ("type" in item && item.type === "function_call_output") {
    return {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: item.call_id, content: item.output },
      ],
    };
  }

  if (!("role" in item)) {
    return { role: "user", content: "" };
  }

  const role = item.role === "developer" ? "user" : item.role;
  if (role === "system") return { role: "system", content: "" };

  return {
    role: role as "user" | "assistant",
    content: item.content as string,
  };
}

function translateToolChoice(
  tc: XAIRequest["tool_choice"]
): AnthropicRequest["tool_choice"] {
  if (!tc) return undefined;
  if (tc === "auto") return { type: "auto" };
  if (tc === "required") return { type: "any" };
  if (tc === "none") return undefined; // no tool_choice means none
  if (typeof tc === "object" && "function" in tc) {
    return { type: "tool", name: tc.function.name };
  }
  return undefined;
}
