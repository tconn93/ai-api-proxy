import { describe, it, expect } from "vitest";
import { anthropicResponseToXai } from "../../src/adapters/xai-to-anthropic/response.js";

describe("xai-to-anthropic response adapter", () => {
  describe("basic text response", () => {
    it("converts a simple text response", () => {
      const result = anthropicResponseToXai(
        {
          id: "msg_abc123",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          content: [{ type: "text", text: "Hello! How can I help?" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 20 },
        },
        "rs_test123",
        "grok-4.3"
      );

      expect(result.id).toBe("rs_test123");
      expect(result.object).toBe("response");
      expect(result.status).toBe("completed");
      expect(result.output).toHaveLength(1);
      expect(result.output[0].type).toBe("message");
      if (result.output[0].type === "message") {
        expect(result.output[0].content).toBe("Hello! How can I help?");
      }
    });
  });

  describe("tool use response", () => {
    it("converts tool_use blocks to function_call output", () => {
      const result = anthropicResponseToXai(
        {
          id: "msg_abc",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          content: [
            { type: "tool_use", id: "tu_1", name: "get_weather", input: { location: "SF" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 20, output_tokens: 15 },
        },
        "rs_tool",
        "grok-4.3"
      );

      const fnCalls = result.output.filter((o) => o.type === "function_call");
      expect(fnCalls).toHaveLength(1);
      expect(fnCalls[0].name).toBe("get_weather");
    });
  });

  describe("usage mapping", () => {
    it("correctly maps token usage", () => {
      const result = anthropicResponseToXai(
        {
          id: "msg_abc",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          content: [{ type: "text", text: "Hi" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 200,
          },
        },
        "rs_usage",
        "grok-4.3"
      );

      expect(result.usage).toBeDefined();
      expect(result.usage!.input_tokens).toBe(100);
      expect(result.usage!.output_tokens).toBe(50);
    });
  });

  describe("stop_reason mapping", () => {
    it('maps max_tokens to "incomplete"', () => {
      const result = anthropicResponseToXai(
        {
          id: "msg_abc",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          content: [{ type: "text", text: "..." }],
          stop_reason: "max_tokens",
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 100 },
        },
        "rs_inc",
        "grok-4.3"
      );

      expect(result.status).toBe("incomplete");
    });
  });
});
