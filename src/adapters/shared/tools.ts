import type { XAITool, XAIFunctionTool, XAIBuiltInTool } from "../../types/xai.js";
import type { AnthropicTool } from "../../types/anthropic.js";

const BUILT_IN_TOOL_TYPES = new Set([
  "web_search",
  "x_search",
  "code_interpreter",
]);

export function isBuiltInTool(tool: XAITool): tool is XAIBuiltInTool {
  return BUILT_IN_TOOL_TYPES.has(tool.type);
}

export function isFunctionTool(tool: XAITool): tool is XAIFunctionTool {
  return tool.type === "function";
}

/** Get array of built-in tool names that are non-portable */
export function getBuiltInToolNames(tools: XAITool[]): string[] {
  return tools.filter(isBuiltInTool).map((t) => t.type);
}

/** Filter out built-in tools, returning only portable function tools */
export function filterPortableTools(
  tools: XAITool[]
): { portable: XAIFunctionTool[]; dropped: string[] } {
  const portable: XAIFunctionTool[] = [];
  const dropped: string[] = [];
  for (const tool of tools) {
    if (isFunctionTool(tool)) {
      portable.push(tool);
    } else {
      dropped.push(tool.type);
    }
  }
  return { portable, dropped };
}

/** Convert XAI function tool to Anthropic tool format */
export function xaiFunctionToolToAnthropic(
  tool: XAIFunctionTool
): AnthropicTool {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters ?? { type: "object", properties: {} },
  };
}

/** Convert XAI tools array to Anthropic tools array (portable only) */
export function translateXaiToolsToAnthropic(
  tools: XAITool[] | undefined
): { tools: AnthropicTool[]; warnings: string[] } {
  if (!tools || tools.length === 0) return { tools: [], warnings: [] };
  const { portable, dropped } = filterPortableTools(tools);
  const warnings: string[] = [];
  for (const name of dropped) {
    warnings.push(
      `Built-in tool "${name}" is not supported by Anthropic and has been removed. ` +
      `Use custom function tools for cross-provider compatibility.`
    );
  }
  return {
    tools: portable.map(xaiFunctionToolToAnthropic),
    warnings,
  };
}

/** Convert Anthropic tool to XAI function tool format */
export function anthropicToolToXaiFunction(anthropicTool: AnthropicTool): XAIFunctionTool {
  return {
    type: "function",
    function: {
      name: anthropicTool.name,
      description: anthropicTool.description,
      parameters: anthropicTool.input_schema,
    },
  };
}
