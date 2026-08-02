import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, expect, it } from "vitest";
import express from "express";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Regression: GET /movies/:id used to capture /movies/export (id="export"),
 * so Profile → Export returned 400 instead of CSV.
 */
describe("movies export route ordering", () => {
  it("serves /movies/export as CSV when registered before :id", async () => {
    const app = express();

    app.get("/movies/export", (_req, res) => {
      res.setHeader("Content-Type", "text/csv");
      res.send("title,status,rating,year,language\n");
    });
    app.get("/movies/:id", (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      res.json({ id });
    });

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;

    try {
      const exportRes = await fetch(`http://127.0.0.1:${port}/movies/export`);
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get("content-type")).toMatch(/text\/csv/);
      expect(await exportRes.text()).toContain("title,status,rating,year,language");

      const idRes = await fetch(`http://127.0.0.1:${port}/movies/42`);
      expect(idRes.status).toBe(200);
      expect(await idRes.json()).toEqual({ id: 42 });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("fails when :id is registered before export (documents the bug)", async () => {
    const app = express();
    app.get("/movies/:id", (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      res.json({ id });
    });
    app.get("/movies/export", (_req, res) => {
      res.type("text/csv").send("title\n");
    });

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/movies/export`);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.any(String) });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("keeps /movies/export registered before /movies/:id in movies router source", () => {
    const src = readFileSync(join(here, "movies/index.ts"), "utf8");
    const exportIdx = src.indexOf('router.get("/movies/export"');
    const idIdx = src.indexOf('router.get("/movies/:id"');
    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(exportIdx).toBeLessThan(idIdx);
  });
});
