import type { Request, Response, NextFunction } from "express";

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const warnings = req.requestWarnings?.length
      ? ` warnings=[${req.requestWarnings.join("; ")}]`
      : "";

    console.log(
      `${req.method} ${req.path} → ${res.statusCode} ${duration}ms${warnings}`
    );
  });

  next();
}
