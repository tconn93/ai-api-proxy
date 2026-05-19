# Getting Started — AI API Proxy

Two-way translation proxy between XAI's Responses API and Anthropic's Messages API.

- `POST /v1/responses` — Accepts XAI Responses API format, proxies to Anthropic
- `POST /v1/messages` — Accepts Anthropic Messages API format, proxies to XAI

Both directions support streaming and non-streaming requests, tool calling, and multi-turn conversation state.

## Prerequisites

- Node.js 18+
- npm 9+
- API keys for the providers you intend to proxy to (XAI and/or Anthropic)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env with your API keys
#    At minimum, set the keys for the providers you want to proxy to

# 4. Start the dev server
npm run dev
```

The server starts on `http://localhost:3000` by default.

## Configuration

All configuration lives in `.env`. Here are the key variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3000` | Proxy server port |
| `PROXY_API_KEY` | *(none)* | If set, clients must provide this as `Authorization: Bearer <key>` |
| `XAI_API_KEY` | — | Your xAI API key |
| `XAI_BASE_URL` | `https://api.x.ai` | xAI API base URL |
| `ANTHROPIC_API_KEY` | — | Your Anthropic API key |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Anthropic API base URL |
| `ANTHROPIC_VERSION` | `2023-06-01` | Anthropic API version header |
| `DEFAULT_MAX_TOKENS` | `4096` | Fallback when request omits max_tokens (Anthropic requires it) |
| `STATE_MANAGER_TTL` | `2592000000` | Conversation history TTL in ms (default 30 days) |

### Model Mapping

The default model map is in `config/default.json`. You can override mappings via environment variables using a comma-separated `from=to` format:

```bash
MODEL_MAP_XAI_TO_ANTHROPIC=grok-4.3=claude-sonnet-4-20250514,grok-4=claude-opus-4-20250514
MODEL_MAP_ANTHROPIC_TO_XAI=claude-sonnet-4-20250514=grok-4.3
```

## Using the Proxy

### XAI Client → Anthropic Backend

Send a Responses API request to the proxy, it translates and forwards to Anthropic:

```bash
curl http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.3",
    "input": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain quantum computing in one sentence."}
    ]
  }'
```

**Streaming:**

```bash
curl http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.3",
    "input": [{"role": "user", "content": "Tell me a story."}],
    "stream": true
  }'
```

**Multi-turn with state (previous_response_id):**

```bash
# First turn
RESPONSE=$(curl -s http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.3",
    "input": [{"role": "user", "content": "My name is Alice."}]
  }')
RESPONSE_ID=$(echo "$RESPONSE" | jq -r '.id')

# Follow-up using previous_response_id — no need to resend history
curl http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"grok-4.3\",
    \"previous_response_id\": \"$RESPONSE_ID\",
    \"input\": [{\"role\": \"user\", \"content\": \"What is my name?\"}]
  }"
```

**Tool calling:**

```bash
curl http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4.3",
    "input": [{"role": "user", "content": "What is the weather in SF?"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather for a location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {"type": "string"}
            }
          }
        }
      }
    ]
  }'
```

### Anthropic Client → XAI Backend

Send a Messages API request to the proxy:

```bash
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-ant-optional" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "system": "You are a helpful assistant.",
    "messages": [
      {"role": "user", "content": "Tell me a joke."}
    ]
  }'
```

**Streaming:**

```bash
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Write a haiku about code."}],
    "stream": true
  }'
```

## Project Structure

```
src/
├── server.ts                   # Express app, listen, graceful shutdown
├── config/
│   ├── index.ts                # Environment variable loader
│   └── model-map.ts            # Bidirectional model alias mapping
├── types/
│   ├── xai.ts                  # XAI Responses API TypeScript types
│   ├── anthropic.ts            # Anthropic Messages API TypeScript types
│   └── shared.ts               # Internal shared types
├── adapters/
│   ├── xai-to-anthropic/       # XAI → Anthropic translation
│   │   ├── request.ts          #   Request translator
│   │   ├── response.ts         #   Response translator
│   │   └── stream.ts           #   SSE event translator
│   ├── anthropic-to-xai/       # Anthropic → XAI translation
│   │   ├── request.ts
│   │   ├── response.ts
│   │   └── stream.ts
│   └── shared/                 # Shared translation utilities
│       ├── messages.ts         #   Role alternation, system extraction
│       ├── tools.ts            #   Tool schema translation
│       └── content-blocks.ts   #   Content block ↔ string conversion
├── services/
│   ├── state-manager.ts        # Conversation history store (in-memory)
│   ├── upstream-client.ts      # HTTP calls to upstream providers
│   └── stream-relay.ts         # SSE pipe + transform pipeline
├── middleware/
│   ├── auth.ts                 # API key validation
│   ├── error-handler.ts        # Error mapping between providers
│   └── request-logger.ts       # Request/response logging
└── routes/
    ├── responses.ts            # POST /v1/responses handler
    └── messages.ts             # POST /v1/messages handler
```

## Data Flow

```
Client Request → Auth → Route Handler
                          ├── State Manager (resolve previous_response_id)
                          ├── Request Adapter (translate format)
                          ├── Upstream HTTP Client (call provider)
                          ├── Response Adapter (translate back)
                          └── Stream Relay (transform SSE, when streaming)
```

## Running Tests

```bash
# Run once
npm test

# Watch mode
npm run test:watch

# Type check
npm run typecheck
```

56 tests across 7 suites covering all adapters, the state manager, and full integration tests with mock upstream servers.

## Known Limitations

- **Built-in xAI tools** (`web_search`, `x_search`, `code_interpreter`) are not portable to Anthropic. The proxy returns a clear warning and strips them from the request. Use custom function tools for cross-provider compatibility.
- **State manager** is in-memory by default. Server restarts lose conversation history. The store interface supports plugging in Redis or a database for persistence.
- **XAI streaming format** is based on OpenAI SSE conventions and may need adjustment against the actual xAI streaming wire format.
- **Image content** (data URIs) in XAI input is forwarded to Anthropic. Non-data URL images are skipped.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm start` | Start the server |
| `npm run build` | Compile TypeScript to dist/ |
| `npm test` | Run all tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type check only |
