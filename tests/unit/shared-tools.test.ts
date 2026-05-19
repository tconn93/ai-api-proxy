import { describe, it, expect } from "vitest";
import {
  isBuiltInTool,
  isFunctionTool,
  filterPortableTools,
  translateXaiToolsToAnthropic,
  xaiFunctionToolToAnthropic,
  anthropicToolToXaiFunction,
} from "../../src/adapters/shared/tools.js";

describe("shared/tools", () => {
  describe("isBuiltInTool", () => {
    it("identifies web_search as built-in", () => {
      expect(isBuiltInTool({ type: "web_search" })).toBe(true);
    });

    it("identifies x_search as built-in", () => {
      expect(isBuiltInTool({ type: "x_search" })).toBe(true);
    });

    it("identifies code_interpreter as built-in", () => {
      expect(isBuiltInTool({ type: "code_interpreter" })).toBe(true);
    });

    it("returns false for function tools", () => {
      expect(
        isBuiltInTool({
          type: "function",
          function: { name: "get_weather" },
        })
      ).toBe(false);
    });
  });

  describe("isFunctionTool", () => {
    it("returns true for function tools", () => {
      expect(
        isFunctionTool({
          type: "function",
          function: { name: "search" },
        })
      ).toBe(true);
    });

    it("returns false for built-in tools", () => {
      expect(isFunctionTool({ type: "web_search" })).toBe(false);
    });
  });

  describe("filterPortableTools", () => {
    it("separates portable from built-in tools", () => {
      const tools = [
        { type: "function" as const, function: { name: "get_weather" } },
        { type: "web_search" as const },
        { type: "function" as const, function: { name: "search" } },
        { type: "x_search" as const },
      ];

      const { portable, dropped } = filterPortableTools(tools);
      expect(portable).toHaveLength(2);
      expect(dropped).toEqual(["web_search", "x_search"]);
    });

    it("returns empty when no tools", () => {
      const { portable, dropped } = filterPortableTools([]);
      expect(portable).toHaveLength(0);
      expect(dropped).toHaveLength(0);
    });
  });

  describe("translateXaiToolsToAnthropic", () => {
    it("translates function tools and warns on built-in", () => {
      const tools = [
        { type: "function" as const, function: { name: "get_weather", parameters: { type: "object", properties: { location: { type: "string" } } } } },
        { type: "web_search" as const },
      ];

      const { tools: translated, warnings } = translateXaiToolsToAnthropic(tools);
      expect(translated).toHaveLength(1);
      expect(translated[0].name).toBe("get_weather");
      expect(translated[0].input_schema).toBeDefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("web_search");
    });

    it("returns empty for undefined tools", () => {
      const { tools, warnings } = translateXaiToolsToAnthropic(undefined);
      expect(tools).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });
  });

  describe("xaiFunctionToolToAnthropic", () => {
    it("converts function tool schema", () => {
      const xaiTool = {
        type: "function" as const,
        function: {
          name: "get_weather",
          description: "Get current weather",
          parameters: {
            type: "object",
            properties: { location: { type: "string" } },
          },
        },
      };

      const result = xaiFunctionToolToAnthropic(xaiTool);
      expect(result.name).toBe("get_weather");
      expect(result.description).toBe("Get current weather");
      expect(result.input_schema).toEqual(xaiTool.function.parameters);
    });

    it("provides default schema when parameters missing", () => {
      const xaiTool = {
        type: "function" as const,
        function: { name: "simple" },
      };

      const result = xaiFunctionToolToAnthropic(xaiTool);
      expect(result.input_schema).toEqual({ type: "object", properties: {} });
    });
  });

  describe("anthropicToolToXaiFunction", () => {
    it("converts Anthropic tool to XAI function format", () => {
      const anthropicTool = {
        name: "search",
        description: "Search the web",
        input_schema: { type: "object", properties: { q: { type: "string" } } },
      };

      const result = anthropicToolToXaiFunction(anthropicTool);
      expect(result.type).toBe("function");
      expect(result.function.name).toBe("search");
      expect(result.function.parameters).toEqual(anthropicTool.input_schema);
    });
  });
});
