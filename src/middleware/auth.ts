import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "../types/shared.js";

declare global {
  namespace Express {
    interface Request {
      appConfig: AppConfig;
      requestWarnings: string[];
    }
  }
}

export function createAuthMiddleware(config: AppConfig) {
  return function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Attach config to request for downstream use
    req.appConfig = config;
    req.requestWarnings = [];

    // If a proxy API key is configured, require it
    if (config.proxyApiKey) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          error: {
            type: "authentication_error",
            message: "Missing or invalid Authorization header. Expected: Bearer <api-key>",
          },
        });
        return;
      }

      const token = authHeader.slice(7);
      if (token !== config.proxyApiKey) {
        res.status(401).json({
          error: {
            type: "authentication_error",
            message: "Invalid API key",
          },
        });
        return;
      }
    }

    next();
  };
}
