import "dotenv/config";
import express from "express";
import { loadConfig } from "./config/index.js";
import { initModelMap } from "./config/model-map.js";
import { createStateManager } from "./services/state-manager.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createResponsesRouter } from "./routes/responses.js";
import { createMessagesRouter } from "./routes/messages.js";

const config = loadConfig();
initModelMap(config.modelMap);

const stateManager = createStateManager(config.stateManagerTtl);

const app = express();

// Body parsing
app.use(express.json({ limit: "10mb" }));

// Middleware
app.use(requestLogger);
app.use(createAuthMiddleware(config));

// Routes
app.use(createResponsesRouter(stateManager));
app.use(createMessagesRouter());

// Error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  console.log(`AI API Proxy running on http://localhost:${config.port}`);
  console.log(`  POST /v1/responses → Anthropic Messages API`);
  console.log(`  POST /v1/messages  → XAI Responses API`);
});

// Graceful shutdown
function shutdown() {
  console.log("\nShutting down...");
  stateManager.pruneExpired();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
