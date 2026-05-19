import { describe, it, expect } from "vitest";
import {
  extractSystemMessages,
  systemMessagesToString,
  ensureAlternation,
  normalizeContent,
} from "../../src/adapters/shared/messages.js";

describe("shared/messages", () => {
  describe("extractSystemMessages", () => {
    it("separates system messages from other roles", () => {
      const input = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
        { role: "system", content: "Also: be concise" },
      ];

      const { systemMessages, rest } = extractSystemMessages(input);
      expect(systemMessages).toHaveLength(2);
      expect(rest).toHaveLength(2);
      expect(rest[0].role).toBe("user");
      expect(rest[1].role).toBe("assistant");
    });

    it("handles no system messages", () => {
      const input = [
        { role: "user", content: "Hello" },
      ];

      const { systemMessages, rest } = extractSystemMessages(input);
      expect(systemMessages).toHaveLength(0);
      expect(rest).toHaveLength(1);
    });

    it("handles input_text content parts in system messages", () => {
      const input = [
        { role: "system", content: [{ type: "input_text", text: "System prompt" }] },
        { role: "user", content: "Hello" },
      ];

      const { systemMessages } = extractSystemMessages(input);
      expect(systemMessages[0].content).toEqual([{ type: "input_text", text: "System prompt" }]);
    });
  });

  describe("systemMessagesToString", () => {
    it("joins system messages with newlines", () => {
      const messages = [
        { role: "system" as const, content: "You are helpful" },
        { role: "system" as const, content: "Be concise" },
      ];

      expect(systemMessagesToString(messages)).toBe("You are helpful\n\nBe concise");
    });

    it("handles content parts", () => {
      const messages = [
        { role: "system" as const, content: [{ type: "input_text", text: "Text part" }] },
      ];

      expect(systemMessagesToString(messages)).toBe("Text part");
    });
  });

  describe("ensureAlternation", () => {
    it("merges consecutive same-role messages", () => {
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "user" as const, content: "Continue" },
        { role: "assistant" as const, content: "Hi" },
      ];

      const result = ensureAlternation(messages);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
    });

    it("preserves already alternating messages", () => {
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi" },
        { role: "user" as const, content: "How are you?" },
      ];

      const result = ensureAlternation(messages);
      expect(result).toHaveLength(3);
    });

    it("handles content blocks when merging", () => {
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "user" as const, content: [{ type: "text", text: "World" }] },
      ];

      const result = ensureAlternation(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
    });
  });

  describe("normalizeContent", () => {
    it("converts string to content blocks", () => {
      const result = normalizeContent("Hello");
      expect(result).toEqual([{ type: "text", text: "Hello" }]);
    });

    it("passes through content blocks", () => {
      const blocks = [{ type: "text" as const, text: "Hello" }];
      expect(normalizeContent(blocks)).toBe(blocks);
    });
  });
});
