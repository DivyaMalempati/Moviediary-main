import type { Express, RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { logger } from "../lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serve the movie-tracker UI from this API process so deep links like
 * /partner and /upcoming work on the public PORT (not only Vite's 5173).
 *
 * Dev: proxy to Vite (FRONTEND_DEV_URL, default http://127.0.0.1:5173)
 * Prod: static files from artifacts/movie-tracker/dist/public when present
 */
export function mountSpaFallback(app: Express): void {
  const frontendDevUrl =
    process.env.FRONTEND_DEV_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:5173");

  if (frontendDevUrl) {
    logger.info({ frontendDevUrl }, "Proxying non-API routes to Vite");
    const proxy = createProxyMiddleware({
      target: frontendDevUrl,
      changeOrigin: true,
      ws: true,
      logLevel: "warn",
    });
    // Anything that didn't match /api (mounted earlier) goes to Vite.
    app.use(proxy as RequestHandler);
    return;
  }

  const candidates = [
    path.resolve(__dirname, "../../../movie-tracker/dist/public"),
    path.resolve(process.cwd(), "../movie-tracker/dist/public"),
    path.resolve(process.cwd(), "artifacts/movie-tracker/dist/public"),
  ];
  const staticDir = candidates.find((dir) => fs.existsSync(path.join(dir, "index.html")));
  if (!staticDir) {
    logger.warn("No frontend dist found — SPA routes will 404 on this port");
    return;
  }

  logger.info({ staticDir }, "Serving built frontend");
  app.use(express.static(staticDir, { index: false }));
  app.get("*path", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}
