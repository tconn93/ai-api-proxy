import type { Request, Response, NextFunction } from "express";
import { UpstreamError } from "../services/upstream-client.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof UpstreamError) {
    res.status(err.status).json({
      error: {
        type: "upstream_error",
        message: err.message,
        upstream_body: err.body,
      },
    });
    return;
  }

  // Catch-all
  res.status(500).json({
    error: {
      type: "internal_error",
      message: err.message || "Internal server error",
    },
  });
}
