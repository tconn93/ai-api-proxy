import type { XAIInputItem, XAISystemMessage } from "../../types/xai.js";
import type { AnthropicMessage, AnthropicContentBlock, AnthropicTextBlock } from "../../types/anthropic.js";

/** Extract system messages from XAI input, returning them and the remaining items */
export function extractSystemMessages(
  input: XAIInputItem[]
): { systemMessages: XAISystemMessage[]; rest: XAIInputItem[] } {
  const systemMessages: XAISystemMessage[] = [];
  const rest: XAIInputItem[] = [];

  for (const item of input) {
    if ("role" in item && item.role === "system") {
      systemMessages.push(item as XAISystemMessage);
    } else {
      rest.push(item);
    }
  }

  return { systemMessages, rest };
}

/** Convert XAI system messages to an Anthropic system string */
export function systemMessagesToString(
  systemMessages: XAISystemMessage[]
): string {
  return systemMessages
    .map((m) => (typeof m.content === "string" ? m.content : contentToString(m.content)))
    .join("\n\n");
}

/** Convert string content or content parts to a simple string */
function contentToString(
  content: string | { type: string; text?: string }[]
): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "input_text"; text: string } => p.type === "input_text")
    .map((p) => p.text)
    .join("");
}

/** Ensure messages strictly alternate user/assistant by merging consecutive same-role */
export function ensureAlternation(
  messages: AnthropicMessage[]
): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    const last = result[result.length - 1];
    if (last && last.role === msg.role) {
      // Merge content into the previous message
      const merged = mergeContent(last.content, msg.content);
      (last as { content: AnthropicMessage["content"] }).content = merged;
    } else {
      result.push({ ...msg });
    }
  }

  return result;
}

function mergeContent(
  a: AnthropicMessage["content"],
  b: AnthropicMessage["content"]
): AnthropicMessage["content"] {
  // If either is a string, convert to content blocks
  const blocksA = toContentBlocks(a);
  const blocksB = toContentBlocks(b);

  // Concatenate last text block of A with first text block of B if both text
  const lastA = blocksA[blocksA.length - 1];
  const firstB = blocksB[0];
  if (
    lastA &&
    firstB &&
    lastA.type === "text" &&
    firstB.type === "text"
  ) {
    const merged: AnthropicTextBlock = { type: "text", text: lastA.text + " " + firstB.text };
    if (lastA.cache_control) merged.cache_control = lastA.cache_control;
    return [...blocksA.slice(0, -1), merged, ...blocksB.slice(1)];
  }

  return [...blocksA, ...blocksB];
}

function toContentBlocks(
  content: string | AnthropicContentBlock[]
): AnthropicContentBlock[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

/** Normalize content: string → [text block] */
export function normalizeContent(
  content: string | AnthropicContentBlock[]
): AnthropicContentBlock[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

/** Convert content to string if it's a simple text, otherwise return content blocks */
export function contentToStringOrBlocks(
  content: AnthropicContentBlock[]
): string | AnthropicContentBlock[] {
  if (
    content.length === 1 &&
    content[0].type === "text" &&
    !content[0].cache_control
  ) {
    return content[0].text;
  }
  return content;
}
