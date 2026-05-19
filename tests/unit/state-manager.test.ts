import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createStateManager } from "../../src/services/state-manager.js";

const TTL = 5000; // 5 seconds for testing

describe("state-manager", () => {
  let manager: ReturnType<typeof createStateManager>;

  beforeEach(() => {
    manager = createStateManager(TTL);
  });

  afterEach(() => {
    manager.pruneExpired();
  });

  describe("generateResponseId", () => {
    it("generates IDs with rs_ prefix", () => {
      const id = manager.generateResponseId();
      expect(id).toMatch(/^rs_[a-f0-9]{24}$/);
    });

    it("generates unique IDs", () => {
      const id1 = manager.generateResponseId();
      const id2 = manager.generateResponseId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("getHistory", () => {
    it("returns null for unknown response ID", () => {
      expect(manager.getHistory("rs_nonexistent")).toBeNull();
    });

    it("returns stored history", () => {
      const id = manager.generateResponseId();
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi!" },
      ];

      manager.storeConversation(id, messages, "grok-4.3");
      const history = manager.getHistory(id);
      expect(history).toEqual(messages);
    });

    it("returns null for expired entries", async () => {
      const shortManager = createStateManager(10); // 10ms TTL
      const id = shortManager.generateResponseId();
      shortManager.storeConversation(id, [{ role: "user" as const, content: "Hi" }], "test");

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 20));

      expect(shortManager.getHistory(id)).toBeNull();
    });
  });

  describe("buildFullHistory", () => {
    it("returns newMessages when no previousResponseId", () => {
      const newMessages = [{ role: "user" as const, content: "Hello" }];
      const result = manager.buildFullHistory(undefined, newMessages);
      expect(result).toBe(newMessages);
    });

    it("prepends history when previousResponseId is valid", () => {
      const prevId = manager.generateResponseId();
      const history = [
        { role: "user" as const, content: "First question" },
        { role: "assistant" as const, content: "First answer" },
      ];
      manager.storeConversation(prevId, history, "grok-4.3");

      const newMessages = [{ role: "user" as const, content: "Follow-up" }];
      const result = manager.buildFullHistory(prevId, newMessages);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(history[0]);
      expect(result[1]).toEqual(history[1]);
      expect(result[2]).toEqual(newMessages[0]);
    });

    it("returns newMessages when previousResponseId is not found", () => {
      const newMessages = [{ role: "user" as const, content: "Hello" }];
      const result = manager.buildFullHistory("rs_unknown", newMessages);
      expect(result).toEqual(newMessages);
    });
  });
});
