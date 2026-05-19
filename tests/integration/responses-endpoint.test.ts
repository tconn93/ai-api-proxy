import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { createServer, type IncomingMessage } from "node:http";
import { loadConfig } from "../../src/config/index.js";
import { initModelMap } from "../../src/config/model-map.js";
import { createStateManager } from "../../src/services/state-manager.js";
import { createAuthMiddleware } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { createResponsesRouter } from "../../src/routes/responses.js";
import { createMessagesRouter } from "../../src/routes/messages.js";

// Override env for tests
process.env.ANTHROPIC_BASE_URL = "http://localhost:19999";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
process.env.XAI_BASE_URL = "http://localhost:19999";
process.env.XAI_API_KEY = "xai-test-key";

let app: express.Express;
let mockServer: Server;
let proxyServer: Server;
const MOCK_PORT = 19999;
const PROXY_PORT = 19998;

function createApp() {
  const config = loadConfig();

  // Override ports and URLs for testing
  config.port = PROXY_PORT;
  config.proxyApiKey = undefined; // No auth for tests
  config.anthropic.baseUrl = `http://localhost:${MOCK_PORT}`;
  config.xai.baseUrl = `http://localhost:${MOCK_PORT}`;

  initModelMap(config.modelMap);

  const stateManager = createStateManager(config.stateManagerTtl);
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(createAuthMiddleware(config));
  app.use(createResponsesRouter(stateManager));
  app.use(createMessagesRouter());
  app.use(errorHandler);

  return { app, stateManager };
}

function startMockAnthropicServer(): Server {
  return createServer((req: IncomingMessage, res) => {
    // Only handle Anthropic endpoint
    if (req.url === "/v1/messages" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body);

        if (parsed.stream) {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write(
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[],"usage":{"input_tokens":10,"output_tokens":0}}}\n\n'
          );
          res.write(
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
          );
          res.write(
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello from mock"}}\n\n'
          );
          res.write(
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n'
          );
          res.write(
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}\n\n'
          );
          res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
          res.end();
          return;
        }

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_abc123",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-4-20250514",
            content: [{ type: "text", text: "Hello! This is a test response from Anthropic." }],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
          })
        );
      });
      return;
    }

    // Handle XAI endpoint for /v1/messages tests
    if (req.url === "/v1/responses" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body);

        if (parsed.stream) {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write(
            'data: {"type":"response.created","response":{"id":"rs_test","object":"response","model":"grok-4.3","output":[],"status":"in_progress"}}\n\n'
          );
          res.write(
            'data: {"type":"response.output_text.delta","delta":"Hello from XAI"}\n\n'
          );
          res.write(
            'data: {"type":"response.completed","response":{"id":"rs_test","object":"response","model":"grok-4.3","output":[{"type":"message","id":"msg_1","role":"assistant","content":"Hello from XAI"}],"usage":{"input_tokens":5,"output_tokens":5},"status":"completed"}}\n\n'
          );
          res.end();
          return;
        }

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "rs_test123",
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            model: "grok-4.3",
            output: [
              {
                type: "message",
                id: "msg_1",
                role: "assistant",
                content: "Hello from XAI!",
                status: "completed",
              },
            ],
            usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
            status: "completed",
          })
        );
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });
}

describe("Proxy API Integration", () => {
  beforeAll(async () => {
    mockServer = startMockAnthropicServer();
    await new Promise<void>((resolve) => mockServer.listen(MOCK_PORT, resolve));

    const { app: expressApp } = createApp();
    app = expressApp;
    await new Promise<void>((resolve) => {
      proxyServer = app.listen(PROXY_PORT, resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  describe("POST /v1/responses", () => {

  it("returns 200 for a valid non-streaming request", async () => {
    const res = await fetch(`http://localhost:${PROXY_PORT}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "grok-4.3",
        input: [{ role: "user", content: "Hello!" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("response");
    expect(body.output).toBeDefined();
    expect(body.output.length).toBeGreaterThan(0);
  });

  it("returns 400 when model is missing", async () => {
    const res = await fetch(`http://localhost:${PROXY_PORT}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: [{ role: "user", content: "Hi" }] }),
    });

    expect(res.status).toBe(400);
  });

  it("handles streaming responses", async () => {
    const res = await fetch(`http://localhost:${PROXY_PORT}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "grok-4.3",
        input: [{ role: "user", content: "Hello!" }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });
});

  describe("POST /v1/messages", () => {
  it("returns 200 for a valid non-streaming request", async () => {
    const res = await fetch(`http://localhost:${PROXY_PORT}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello!" }],
        max_tokens: 100,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("message");
    expect(body.content).toBeDefined();
  });

  it("handles streaming responses", async () => {
    const res = await fetch(`http://localhost:${PROXY_PORT}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello!" }],
        max_tokens: 100,
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });
});
});
