import { Router, type Request, type Response, type NextFunction } from "express";
import { xaiRequestToAnthropic } from "../adapters/xai-to-anthropic/request.js";
import { anthropicResponseToXai } from "../adapters/xai-to-anthropic/response.js";
import { createAnthropicToXaiStreamTranslator } from "../adapters/xai-to-anthropic/stream.js";
import {
  createUpstreamClient,
  parseAnthropicResponse,
} from "../services/upstream-client.js";
import { pipeTranslatedStream } from "../services/stream-relay.js";
import type { AppConfig } from "../types/shared.js";

export function createResponsesRouter(
  stateManager: ReturnType<
    typeof import("../services/state-manager.js").createStateManager
  >
): Router {
  const router = Router();
  const upstreamClient = createUpstreamClient();

  router.post(
    "/v1/responses",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const config: AppConfig = req.appConfig;
        const body = req.body;

        // Validate minimum fields
        if (!body.model || !body.input) {
          res.status(400).json({
            error: {
              type: "invalid_request_error",
              message: "Missing required fields: model, input",
            },
          });
          return;
        }

        // Resolve state
        const previousHistory = stateManager.buildFullHistory(
          body.previous_response_id ?? undefined,
          []
        );

        // Translate request
        const { request: anthropicReq, warnings, normalizedMessages } =
          xaiRequestToAnthropic(body, previousHistory, config.defaultMaxTokens);

        if (warnings.length > 0) {
          req.requestWarnings.push(...warnings);
        }

        // Call upstream
        const upstreamResponse = await upstreamClient.callAnthropic(
          anthropicReq,
          config.anthropic.apiKey,
          config.anthropic.baseUrl,
          config.anthropic.version
        );

        if (body.stream) {
          res.setHeader("content-type", "text/event-stream");
          res.setHeader("cache-control", "no-cache");
          res.setHeader("connection", "keep-alive");

          if (upstreamResponse.body) {
            const translator = createAnthropicToXaiStreamTranslator();
            await pipeTranslatedStream(upstreamResponse.body, res, translator);
          }
          res.end();
          return;
        }

        // Non-streaming: parse and translate response
        const anthropicRes = await parseAnthropicResponse(upstreamResponse);
        const responseId = stateManager.generateResponseId();

        // Store conversation for continuity
        const assistantMessage = {
          role: "assistant" as const,
          content: anthropicRes.content
            .filter((b) => b.type === "text")
            .map((b) => ("text" in b ? b.text : ""))
            .join(""),
        };

        stateManager.storeConversation(
          responseId,
          [...normalizedMessages, assistantMessage],
          body.model,
          config.stateManagerTtl
        );

        // Translate response back to XAI format
        const xaiRes = anthropicResponseToXai(
          anthropicRes,
          responseId,
          body.model
        );

        res.json(xaiRes);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
