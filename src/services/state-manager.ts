import type { StoredConversation, NormalizedMessage } from "../types/shared.js";

export interface ConversationStateManager {
  getHistory(responseId: string): NormalizedMessage[] | null;
  storeConversation(
    responseId: string,
    messages: NormalizedMessage[],
    model: string,
    ttlMs?: number
  ): void;
  buildFullHistory(
    previousResponseId: string | undefined,
    newMessages: NormalizedMessage[]
  ): NormalizedMessage[];
  generateResponseId(): string;
  pruneExpired(): void;
}

export function createStateManager(
  defaultTtlMs: number
): ConversationStateManager {
  const store = new Map<string, StoredConversation>();
  let pruneInterval: ReturnType<typeof setInterval> | null = null;

  function generateResponseId(): string {
    const random = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    return `rs_${random}`;
  }

  function getHistory(responseId: string): NormalizedMessage[] | null {
    const entry = store.get(responseId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(responseId);
      return null;
    }
    return entry.messages;
  }

  function storeConversation(
    responseId: string,
    messages: NormalizedMessage[],
    model: string,
    ttlMs?: number
  ): void {
    const ttl = ttlMs ?? defaultTtlMs;
    const entry: StoredConversation = {
      responseId,
      model,
      messages,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    store.set(responseId, entry);
  }

  function buildFullHistory(
    previousResponseId: string | undefined,
    newMessages: NormalizedMessage[]
  ): NormalizedMessage[] {
    if (!previousResponseId) return newMessages;

    const history = getHistory(previousResponseId);
    if (!history) {
      // ID not found — just use new messages
      return newMessages;
    }

    return [...history, ...newMessages];
  }

  function pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) {
        store.delete(key);
      }
    }
  }

  // Start periodic pruning every hour
  pruneInterval = setInterval(pruneExpired, 60 * 60 * 1000);
  if (pruneInterval.unref) pruneInterval.unref();

  return {
    getHistory,
    storeConversation,
    buildFullHistory,
    generateResponseId,
    pruneExpired,
  };
}
