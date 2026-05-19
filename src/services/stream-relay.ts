import type { Response } from "express";

/**
 * Parse SSE text into individual events.
 * Each event is an object with event type and data payload.
 */
export interface SSEEvent {
  event?: string;
  data: string;
}

export function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = chunk.split("\n");
  let currentEvent: string | undefined;
  let currentData: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      currentData.push(line.slice(6));
    } else if (line.trim() === "" && currentData.length > 0) {
      events.push({
        event: currentEvent,
        data: currentData.join("\n"),
      });
      currentEvent = undefined;
      currentData = [];
    }
  }

  // Flush any remaining data (partial event)
  if (currentData.length > 0) {
    events.push({
      event: currentEvent,
      data: currentData.join("\n"),
    });
  }

  return events;
}

/** Format an SSE event back to wire format */
export function formatSSEEvent(event: SSEEvent): string {
  let output = "";
  if (event.event) {
    output += `event: ${event.event}\n`;
  }
  output += `data: ${event.data}\n\n`;
  return output;
}

/**
 * Pipe a ReadableStream through an SSE translator and write to Express response.
 * The translator function receives parsed SSE events and returns translated ones.
 */
export async function pipeTranslatedStream(
  upstreamBody: ReadableStream<Uint8Array>,
  res: Response,
  translator: (event: SSEEvent) => SSEEvent | SSEEvent[] | null
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = upstreamBody.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by double newline)
      const parts = buffer.split("\n\n");
      // The last part may be incomplete
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;
        const events = parseSSEChunk(part + "\n\n");
        for (const event of events) {
          const translated = translator(event);
          if (translated === null) continue;
          const items = Array.isArray(translated) ? translated : [translated];
          for (const item of items) {
            res.write(formatSSEEvent(item));
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const events = parseSSEChunk(buffer);
      for (const event of events) {
        const translated = translator(event);
        if (translated === null) continue;
        const items = Array.isArray(translated) ? translated : [translated];
        for (const item of items) {
          res.write(formatSSEEvent(item));
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
