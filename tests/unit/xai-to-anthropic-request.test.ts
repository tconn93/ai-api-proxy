import { describe, it, expect } from "vitest";
import { xaiRequestToAnthropic } from "../../src/adapters/xai-to-anthropic/request.js";

// Initialize model map for tests
import { initModelMap } from "../../src/config/model-map.js";
initModelMap({
  xaiToAnthropic: { "grok-4.3": "claude-sonnet-4-20250514" },
  anthropicToXAI: {},
});

describe("xai-to-anthropic request adapter", () => {
  describe("basic text request", () => {
    it("converts a simple user message", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "Hello!" }],
        },
        [],
        4096
      );

      expect(result.request.model).toBe("claude-sonnet-4-20250514");
      expect(result.request.messages).toHaveLength(1);
      expect(result.request.messages[0].role).toBe("user");
      expect(result.request.max_tokens).toBe(4096);
    });

    it("extracts system messages to top-level system", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [
            { role: "system", content: "You are a helpful assistant" },
            { role: "user", content: "Hello" },
          ],
        },
        [],
        4096
      );

      expect(result.request.system).toBe("You are a helpful assistant");
      expect(result.request.messages).toHaveLength(1);
      expect(result.request.messages[0].role).toBe("user");
    });

    it("merges multiple system messages", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [
            { role: "system", content: "Be helpful" },
            { role: "system", content: "Be concise" },
            { role: "user", content: "Hello" },
          ],
        },
        [],
        4096
      );

      expect(result.request.system).toBe("Be helpful\n\nBe concise");
    });

    it("converts string content to content blocks", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "Hello!" }],
        },
        [],
        4096
      );

      const content = result.request.messages[0].content;
      expect(Array.isArray(content)).toBe(true);
      if (Array.isArray(content)) {
        expect(content[0].type).toBe("text");
        expect((content[0] as { text: string }).text).toBe("Hello!");
      }
    });

    it("uses xai instructions as system when no system messages", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "Hello" }],
          instructions: "Be helpful and concise",
        },
        [],
        4096
      );

      expect(result.request.system).toBe("Be helpful and concise");
    });
  });

  describe("tool handling", () => {
    it("translates function tools", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "What is the weather?" }],
          tools: [
            {
              type: "function",
              function: {
                name: "get_weather",
                description: "Get weather for a location",
                parameters: {
                  type: "object",
                  properties: { location: { type: "string" } },
                },
              },
            },
          ],
        },
        [],
        4096
      );

      expect(result.request.tools).toHaveLength(1);
      expect(result.request.tools![0].name).toBe("get_weather");
      expect(result.request.tools![0].input_schema).toBeDefined();
    });

    it("warns on built-in tools", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "Search for xAI" }],
          tools: [{ type: "web_search" }],
        },
        [],
        4096
      );

      expect(result.request.tools ?? []).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("web_search");
    });
  });

  describe("model mapping", () => {
    it("uses fallback when model is unknown", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "unknown-model",
          input: [{ role: "user", content: "Hi" }],
        },
        [],
        4096
      );

      // Falls through to the original model name
      expect(result.request.model).toBe("unknown-model");
    });
  });

  describe("max_tokens", () => {
    it("uses provided max_output_tokens", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "Hi" }],
          max_output_tokens: 100,
        },
        [],
        4096
      );

      expect(result.request.max_tokens).toBe(100);
    });

    it("uses default when max_output_tokens not set", () => {
      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "Hi" }],
        },
        [],
        2048
      );

      expect(result.request.max_tokens).toBe(2048);
    });
  });

  describe("stateful conversation", () => {
    it("prepends previous history", () => {
      const history = [
        { role: "user" as const, content: "First message" },
        { role: "assistant" as const, content: "First response" },
      ];

      const result = xaiRequestToAnthropic(
        {
          model: "grok-4.3",
          input: [{ role: "user", content: "Follow-up" }],
        },
        history,
        4096
      );

      expect(result.request.messages).toHaveLength(3);
    });
  });
});
