import { Router, type Request, type Response, type NextFunction } from "express";
import { anthropicRequestToXai } from "../adapters/anthropic-to-xai/request.js";
import { xaiResponseToAnthropic } from "../adapters/anthropic-to-xai/response.js";
import { createXaiToAnthropicStreamTranslator } from "../adapters/anthropic-to-xai/stream.js";
import {
  createUpstreamClient,
  parseXaiResponse,
} from "../services/upstream-client.js";
import { pipeTranslatedStream } from "../services/stream-relay.js";
import type { AppConfig } from "../types/shared.js";

export function createMessagesRouter(): Router {
  const router = Router();
  const upstreamClient = createUpstreamClient();

  router.post(
    "/v1/messages",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const config: AppConfig = req.appConfig;
        const body = req.body;

        // Validate minimum fields
        if (!body.model || !body.messages) {
          res.status(400).json({
            error: {
              type: "invalid_request_error",
              message: "Missing required fields: model, messages",
            },
          });
          return;
        }

        // Translate request
        const xaiReq = anthropicRequestToXai(body);

        // Call upstream
        const upstreamResponse = await upstreamClient.callXAI(
          xaiReq,
          config.xai.apiKey,
          config.xai.baseUrl
        );

        if (body.stream) {
          res.setHeader("content-type", "text/event-stream");
          res.setHeader("cache-control", "no-cache");
          res.setHeader("connection", "keep-alive");

          if (upstreamResponse.body) {
            const translator = createXaiToAnthropicStreamTranslator();
            await pipeTranslatedStream(upstreamResponse.body, res, translator);
          }
          res.end();
          return;
        }

        // Non-streaming: parse and translate response
        const xaiRes = await parseXaiResponse(upstreamResponse);

        // Translate response back to Anthropic format
        const anthropicRes = xaiResponseToAnthropic(xaiRes, body.model);

        res.json(anthropicRes);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
