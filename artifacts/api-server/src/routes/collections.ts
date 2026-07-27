import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, moviesTable, collectionsTable, collectionMoviesTable } from "@workspace/db";
import type { SmartRule } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function getUserCollection(userId: string, collectionId: number) {
  const [col] = await db
    .select()
    .from(collectionsTable)
    .where(and(eq(collectionsTable.userId, userId), eq(collectionsTable.id, collectionId)));
  return col ?? null;
}

/** Apply smart rules to return matching movies for a user */
async function getSmartMovies(userId: string, rules: SmartRule[]) {
  // Fetch all user's movies and filter in JS (simpler, avoids complex dynamic SQL)
  const allMovies = await db
    .select()
    .from(moviesTable)
    .where(eq(moviesTable.userId, userId));

  return allMovies.filter((m) => {
    for (const rule of rules) {
      switch (rule.field) {
        case "genre":
          if (!m.genres || !m.genres.map((g) => g.toLowerCase()).includes(rule.value.toLowerCase())) return false;
          break;
        case "language":
          if ((m.originalLanguage ?? "").toLowerCase() !== rule.value.toLowerCase()) return false;
          break;
        case "status":
          if (m.status !== rule.value) return false;
          break;
        case "rating":
          if ((m.rating ?? "") !== rule.value) return false;
          break;
        case "yearFrom":
          if ((m.releaseYear ?? 0) < parseInt(rule.value, 10)) return false;
          break;
        case "yearTo":
          if ((m.releaseYear ?? 9999) > parseInt(rule.value, 10)) return false;
          break;
      }
    }
    return true;
  });
}

async function collectionWithMeta(userId: string, collectionId: number) {
  const col = await getUserCollection(userId, collectionId);
  if (!col) return null;

  const rules = col.rules as SmartRule[] | null;
  const isSmart = Array.isArray(rules) && rules.length > 0;

  let movieIds: number[] = [];
  let posters: (string | null)[] = [];

  if (isSmart) {
    const movies = await getSmartMovies(userId, rules);
    movieIds = movies.map((m) => m.id);
    posters = movies.slice(0, 4).map((m) => m.posterPath ?? null);
  } else {
    const links = await db
      .select({ movieId: collectionMoviesTable.movieId })
      .from(collectionMoviesTable)
      .where(eq(collectionMoviesTable.collectionId, collectionId));

    movieIds = links.map((l) => l.movieId);
    if (movieIds.length > 0) {
      const movies = await db
        .select({ id: moviesTable.id, posterPath: moviesTable.posterPath })
        .from(moviesTable)
        .where(inArray(moviesTable.id, movieIds.slice(0, 4)));
      posters = movies.map((m) => m.posterPath ?? null);
    }
  }

  return { ...col, rules: rules ?? null, movieCount: movieIds.length, posters, movieIds };
}

// ── GET /api/collections ─────────────────────────────────────────────────────
router.get("/collections", requireAuth, async (req: any, res): Promise<void> => {
  const cols = await db
    .select()
    .from(collectionsTable)
    .where(eq(collectionsTable.userId, req.userId))
    .orderBy(collectionsTable.createdAt);

  const results = await Promise.all(cols.map((c) => collectionWithMeta(req.userId, c.id)));
  res.json(results.filter(Boolean));
});

// ── POST /api/collections ────────────────────────────────────────────────────
router.post("/collections", requireAuth, async (req: any, res): Promise<void> => {
  const { name, rules } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const parsedRules = parseRules(rules);
  if (parsedRules === false) {
    res.status(400).json({ error: "Invalid rules format" });
    return;
  }

  const [col] = await db
    .insert(collectionsTable)
    .values({ userId: req.userId, name: name.trim(), rules: parsedRules })
    .returning();
  res.status(201).json({ ...col, rules: parsedRules, movieCount: 0, posters: [], movieIds: [] });
});

// ── PATCH /api/collections/:id ───────────────────────────────────────────────
router.patch("/collections/:id", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { name, rules } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const parsedRules = parseRules(rules);
  if (parsedRules === false) {
    res.status(400).json({ error: "Invalid rules format" });
    return;
  }

  const col = await getUserCollection(req.userId, id);
  if (!col) { res.status(404).json({ error: "Not found" }); return; }

  const updateData: Record<string, any> = { name: name.trim() };
  // Allow explicitly passing null to clear rules, or an array to set them
  if (rules !== undefined) {
    updateData.rules = parsedRules;
  }

  const [updated] = await db
    .update(collectionsTable)
    .set(updateData)
    .where(and(eq(collectionsTable.userId, req.userId), eq(collectionsTable.id, id)))
    .returning();
  res.json(await collectionWithMeta(req.userId, updated.id));
});

// ── DELETE /api/collections/:id ──────────────────────────────────────────────
router.delete("/collections/:id", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const col = await getUserCollection(req.userId, id);
  if (!col) { res.status(404).json({ error: "Not found" }); return; }

  await db
    .delete(collectionsTable)
    .where(and(eq(collectionsTable.userId, req.userId), eq(collectionsTable.id, id)));
  res.sendStatus(204);
});

// ── GET /api/collections/:id/movies ─────────────────────────────────────────
router.get("/collections/:id/movies", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const col = await getUserCollection(req.userId, id);
  if (!col) { res.status(404).json({ error: "Not found" }); return; }

  const rules = col.rules as SmartRule[] | null;
  const isSmart = Array.isArray(rules) && rules.length > 0;

  let movies: any[];
  if (isSmart) {
    movies = await getSmartMovies(req.userId, rules);
  } else {
    const links = await db
      .select({ movieId: collectionMoviesTable.movieId })
      .from(collectionMoviesTable)
      .where(eq(collectionMoviesTable.collectionId, id));

    const movieIds = links.map((l) => l.movieId);
    if (movieIds.length === 0) { res.json([]); return; }

    movies = await db
      .select()
      .from(moviesTable)
      .where(inArray(moviesTable.id, movieIds));
  }

  res.json(movies.map((m) => ({
    id: m.id, title: m.title, status: m.status, rating: m.rating ?? null,
    posterPath: m.posterPath ?? null, releaseYear: m.releaseYear ?? null,
    originalLanguage: m.originalLanguage ?? null, genres: m.genres ?? null,
    tmdbId: m.tmdbId ?? null, createdAt: m.createdAt.toISOString(),
  })));
});

// ── POST /api/collections/:id/movies ─────────────────────────────────────────
router.post("/collections/:id/movies", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { movieId } = req.body ?? {};
  if (!movieId) { res.status(400).json({ error: "movieId required" }); return; }

  const col = await getUserCollection(req.userId, id);
  if (!col) { res.status(404).json({ error: "Collection not found" }); return; }

  // Smart collections auto-populate — no manual add
  const rules = col.rules as SmartRule[] | null;
  if (Array.isArray(rules) && rules.length > 0) {
    res.status(400).json({ error: "Cannot manually add movies to a smart collection" });
    return;
  }

  // Verify movie belongs to user
  const [movie] = await db
    .select({ id: moviesTable.id })
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, Number(movieId))));
  if (!movie) { res.status(404).json({ error: "Movie not found" }); return; }

  await db
    .insert(collectionMoviesTable)
    .values({ collectionId: id, movieId: Number(movieId) })
    .onConflictDoNothing();

  res.status(201).json({ ok: true });
});

// ── DELETE /api/collections/:id/movies/:movieId ──────────────────────────────
router.delete("/collections/:id/movies/:movieId", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const movieId = parseInt(req.params.movieId, 10);

  const col = await getUserCollection(req.userId, id);
  if (!col) { res.status(404).json({ error: "Not found" }); return; }

  await db
    .delete(collectionMoviesTable)
    .where(and(
      eq(collectionMoviesTable.collectionId, id),
      eq(collectionMoviesTable.movieId, movieId),
    ));
  res.sendStatus(204);
});

// ── GET /api/movies/:movieId/collections ─────────────────────────────────────
// Returns list of collection IDs this movie belongs to
router.get("/movies/:movieId/collections", requireAuth, async (req: any, res): Promise<void> => {
  const movieId = parseInt(req.params.movieId, 10);

  // Verify movie belongs to user
  const [movie] = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, movieId)));
  if (!movie) { res.status(404).json({ error: "Movie not found" }); return; }

  // Get all collections for the user
  const userCols = await db
    .select()
    .from(collectionsTable)
    .where(eq(collectionsTable.userId, req.userId));

  const collectionIds: number[] = [];

  for (const col of userCols) {
    const rules = col.rules as SmartRule[] | null;
    if (Array.isArray(rules) && rules.length > 0) {
      // Smart: check if movie matches rules
      const matches = (await getSmartMovies(req.userId, rules)).some((m) => m.id === movieId);
      if (matches) collectionIds.push(col.id);
    } else {
      // Manual: check join table
      const [link] = await db
        .select({ collectionId: collectionMoviesTable.collectionId })
        .from(collectionMoviesTable)
        .where(and(
          eq(collectionMoviesTable.movieId, movieId),
          eq(collectionMoviesTable.collectionId, col.id),
        ));
      if (link) collectionIds.push(col.id);
    }
  }

  res.json(collectionIds);
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Parse and validate rules from request body. Returns null for no rules, false for invalid. */
function parseRules(rules: unknown): SmartRule[] | null | false {
  if (rules === null || rules === undefined) return null;
  if (!Array.isArray(rules)) return false;
  if (rules.length === 0) return null;

  const validFields = new Set(["genre", "language", "status", "rating", "yearFrom", "yearTo"]);
  for (const r of rules) {
    if (typeof r !== "object" || r === null) return false;
    const { field, value } = r as any;
    if (!validFields.has(field) || typeof value !== "string" || !value) return false;
  }
  return rules as SmartRule[];
}

export default router;
