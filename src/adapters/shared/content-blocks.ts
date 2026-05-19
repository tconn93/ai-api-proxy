import type {
  AnthropicContentBlock,
  AnthropicTextBlock,
  AnthropicImageBlock,
} from "../../types/anthropic.js";
import type { XAIContentPart } from "../../types/xai.js";

/** Convert a string to Anthropic content blocks (always at least [text block]) */
export function stringToContentBlocks(
  content: string
): (AnthropicTextBlock | AnthropicImageBlock)[] {
  if (!content) return [{ type: "text", text: content }];
  return [{ type: "text", text: content }];
}

/** Convert XAI content parts to Anthropic content blocks */
export function xaiContentToAnthropicBlocks(
  content: string | XAIContentPart[]
): (AnthropicTextBlock | AnthropicImageBlock)[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  const blocks: (AnthropicTextBlock | AnthropicImageBlock)[] = [];
  for (const part of content) {
    if (part.type === "input_text") {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "input_image") {
      // image_url could be a data URI or a URL
      const imageUrl = part.image_url;
      if (imageUrl.startsWith("data:")) {
        const [header, data] = imageUrl.split(",");
        const mediaType = header.split(":")[1]?.split(";")[0] ?? "image/jpeg";
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data,
          },
        });
      }
      // Non-data URLs cannot be sent to Anthropic directly; skip with note
    }
  }
  return blocks;
}

/** Convert Anthropic content blocks to XAI content parts */
export function anthropicBlocksToXaiContent(
  blocks: AnthropicContentBlock[]
): string | XAIContentPart[] {
  // If only simple text, return a string
  const textOnly = blocks.every((b) => b.type === "text");
  if (textOnly) {
    return blocks.map((b) => ("text" in b ? b.text : "")).join("");
  }

  const parts: XAIContentPart[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push({ type: "input_text", text: block.text });
    }
    // Images, tool blocks etc. handled elsewhere
  }
  return parts;
}
