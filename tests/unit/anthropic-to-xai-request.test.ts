import { describe, it, expect } from "vitest";
import { anthropicRequestToXai } from "../../src/adapters/anthropic-to-xai/request.js";

import { initModelMap } from "../../src/config/model-map.js";
initModelMap({
  xaiToAnthropic: {},
  anthropicToXAI: { "claude-sonnet-4-20250514": "grok-4.3" },
});

describe("anthropic-to-xai request adapter", () => {
  it("converts a simple text message", () => {
    const result = anthropicRequestToXai({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hello!" }],
      max_tokens: 4096,
    });

    expect(result.model).toBe("grok-4.3");
    expect(result.input).toHaveLength(1);
    expect(result.input[0].role).toBe("user");
    expect(result.max_output_tokens).toBe(4096);
  });

  it("converts system to input system message", () => {
    const result = anthropicRequestToXai({
      model: "claude-sonnet-4-20250514",
      system: "You are helpful",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 100,
    });

    expect(result.input).toHaveLength(2);
    expect(result.input[0].role).toBe("system");
    expect(result.input[0].content).toBe("You are helpful");
  });

  it("translates tools", () => {
    const result = anthropicRequestToXai({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Weather?" }],
      max_tokens: 100,
      tools: [
        {
          name: "get_weather",
          description: "Get weather",
          input_schema: { type: "object", properties: { loc: { type: "string" } } },
        },
      ],
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools![0].type).toBe("function");
    if (result.tools![0].type === "function") {
      expect(result.tools![0].function.name).toBe("get_weather");
    }
  });

  it("maps tool_choice auto", () => {
    const result = anthropicRequestToXai({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 100,
      tool_choice: { type: "auto" },
    });

    expect(result.tool_choice).toBe("auto");
  });

  it("maps tool_choice any to required", () => {
    const result = anthropicRequestToXai({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 100,
      tool_choice: { type: "any" },
    });

    expect(result.tool_choice).toBe("required");
  });
});
