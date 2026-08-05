import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { db, moviesTable, collectionsTable, collectionMoviesTable } from "@workspace/db";
import type { SmartRule } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { ensureSchema } from "../lib/ensure-schema.js";

const router: IRouter = Router();

type CollectionVisibility = "private" | "public";

export type SharedCollectionItem = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  mediaType: string;
};

function mintShareToken(): string {
  return `col_${randomBytes(16).toString("hex")}`;
}

function parseVisibility(raw: unknown): CollectionVisibility | null | false {
  if (raw === undefined) return null;
  if (raw === "private" || raw === "public") return raw;
  return false;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function getUserCollection(userId: string, collectionId: number) {
  const [col] = await db
    .select()
    .from(collectionsTable)
    .where(and(eq(collectionsTable.userId, userId), eq(collectionsTable.id, collectionId)));
  return col ?? null;
}

async function getPublicCollectionByToken(token: string) {
  if (!token || typeof token !== "string") return null;
  const [col] = await db
    .select()
    .from(collectionsTable)
    .where(and(eq(collectionsTable.shareToken, token), eq(collectionsTable.visibility, "public")));
  return col ?? null;
}

/** Apply smart rules to return matching movies for a user (active rows only). */
async function getSmartMovies(userId: string, rules: SmartRule[]) {
  const allMovies = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, userId), isNull(moviesTable.deletedAt)));

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

async function getCollectionOwnerMovies(col: typeof collectionsTable.$inferSelect) {
  const rules = col.rules as SmartRule[] | null;
  const isSmart = Array.isArray(rules) && rules.length > 0;

  if (isSmart) {
    return getSmartMovies(col.userId, rules);
  }

  const links = await db
    .select({ movieId: collectionMoviesTable.movieId })
    .from(collectionMoviesTable)
    .where(eq(collectionMoviesTable.collectionId, col.id));

  const movieIds = links.map((l) => l.movieId);
  if (movieIds.length === 0) return [];

  return db
    .select()
    .from(moviesTable)
    .where(
      and(
        eq(moviesTable.userId, col.userId),
        inArray(moviesTable.id, movieIds),
        isNull(moviesTable.deletedAt),
      ),
    );
}

function toSharedItems(
  movies: Array<{
    tmdbId: number | null;
    title: string;
    posterPath: string | null;
    releaseYear: number | null;
    mediaType: string;
  }>,
): SharedCollectionItem[] {
  const seen = new Set<number>();
  const items: SharedCollectionItem[] = [];
  for (const m of movies) {
    if (m.tmdbId == null || seen.has(m.tmdbId)) continue;
    seen.add(m.tmdbId);
    items.push({
      tmdbId: m.tmdbId,
      title: m.title,
      posterPath: m.posterPath ?? null,
      releaseYear: m.releaseYear ?? null,
      mediaType: m.mediaType ?? "movie",
    });
  }
  return items;
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
        .where(and(inArray(moviesTable.id, movieIds.slice(0, 4)), isNull(moviesTable.deletedAt)));
      posters = movies.map((m) => m.posterPath ?? null);
    }
  }

  return {
    ...col,
    rules: rules ?? null,
    visibility: (col.visibility as CollectionVisibility) ?? "private",
    shareToken: col.shareToken ?? null,
    movieCount: movieIds.length,
    posters,
    movieIds,
  };
}

// ── Shared read (auth optional) — must be before /collections/:id ────────────

router.get("/collections/shared/:token", async (req, res): Promise<void> => {
  try {
    await ensureSchema();
  } catch {
    /* best-effort */
  }

  const token = String(req.params.token ?? "").trim();
  const col = await getPublicCollectionByToken(token);
  if (!col) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }

  const movies = await getCollectionOwnerMovies(col);
  const items = toSharedItems(movies);

  res.json({
    name: col.name,
    visibility: "public",
    itemCount: items.length,
    items,
  });
});

// ── Shared copy → viewer watchlist (auth required) ───────────────────────────

router.post("/collections/shared/:token/copy", requireAuth, async (req: any, res): Promise<void> => {
  try {
    await ensureSchema();
  } catch {
    /* best-effort */
  }

  const token = String(req.params.token ?? "").trim();
  const col = await getPublicCollectionByToken(token);
  if (!col) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }

  const body = req.body ?? {};
  const all = body.all === true;
  const rawIds = Array.isArray(body.tmdbIds) ? body.tmdbIds : [];
  const requestedIds = rawIds
    .map((id: unknown) => Number(id))
    .filter((id: number) => Number.isFinite(id) && id > 0);

  if (!all && requestedIds.length === 0) {
    res.status(400).json({ error: "Provide tmdbIds or all: true" });
    return;
  }

  const movies = await getCollectionOwnerMovies(col);
  const allowed = toSharedItems(movies);
  const byTmdb = new Map(allowed.map((i) => [i.tmdbId, i]));

  const targetIds = all ? allowed.map((i) => i.tmdbId) : requestedIds;
  let added = 0;
  let skipped = 0;
  let missing = 0;

  for (const tmdbId of targetIds) {
    const item = byTmdb.get(tmdbId);
    if (!item) {
      missing += 1;
      continue;
    }

    const existing = await db
      .select({ id: moviesTable.id, deletedAt: moviesTable.deletedAt })
      .from(moviesTable)
      .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.tmdbId, tmdbId)))
      .limit(5);

    const active = existing.find((m) => m.deletedAt == null);
    if (active) {
      skipped += 1;
      continue;
    }

    const softDeleted = existing.find((m) => m.deletedAt != null);
    if (softDeleted) {
      await db
        .update(moviesTable)
        .set({
          deletedAt: null,
          status: "watchlist",
          title: item.title,
          posterPath: item.posterPath,
          releaseYear: item.releaseYear,
          mediaType: item.mediaType === "tv" ? "tv" : "movie",
          rating: null,
          notes: null,
          watchedAt: null,
          firstWatchedAt: null,
        })
        .where(eq(moviesTable.id, softDeleted.id));
      added += 1;
      continue;
    }

    await db.insert(moviesTable).values({
      userId: req.userId,
      title: item.title,
      status: "watchlist",
      tmdbId: item.tmdbId,
      posterPath: item.posterPath,
      releaseYear: item.releaseYear,
      mediaType: item.mediaType === "tv" ? "tv" : "movie",
    });
    added += 1;
  }

  res.json({ added, skipped, missing });
});

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
  try {
    await ensureSchema();
  } catch {
    /* best-effort */
  }

  const { name, rules, visibility: rawVisibility } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const parsedRules = parseRules(rules);
  if (parsedRules === false) {
    res.status(400).json({ error: "Invalid rules format" });
    return;
  }

  const visibilityParsed = parseVisibility(rawVisibility);
  if (visibilityParsed === false) {
    res.status(400).json({ error: "visibility must be private or public" });
    return;
  }
  const visibility: CollectionVisibility = visibilityParsed ?? "private";
  const shareToken = visibility === "public" ? mintShareToken() : null;

  const [col] = await db
    .insert(collectionsTable)
    .values({
      userId: req.userId,
      name: name.trim(),
      rules: parsedRules,
      visibility,
      shareToken,
    })
    .returning();
  res.status(201).json({
    ...col,
    rules: parsedRules,
    visibility,
    shareToken,
    movieCount: 0,
    posters: [],
    movieIds: [],
  });
});

// ── PATCH /api/collections/:id ───────────────────────────────────────────────
router.patch("/collections/:id", requireAuth, async (req: any, res): Promise<void> => {
  try {
    await ensureSchema();
  } catch {
    /* best-effort */
  }

  const id = parseInt(req.params.id, 10);
  const { name, rules, visibility: rawVisibility } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const parsedRules = parseRules(rules);
  if (parsedRules === false) {
    res.status(400).json({ error: "Invalid rules format" });
    return;
  }

  const visibilityParsed = parseVisibility(rawVisibility);
  if (visibilityParsed === false) {
    res.status(400).json({ error: "visibility must be private or public" });
    return;
  }

  const col = await getUserCollection(req.userId, id);
  if (!col) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const updateData: Record<string, unknown> = { name: name.trim() };
  if (rules !== undefined) {
    updateData.rules = parsedRules;
  }

  if (visibilityParsed !== null) {
    updateData.visibility = visibilityParsed;
    if (visibilityParsed === "public") {
      updateData.shareToken = col.shareToken ?? mintShareToken();
    } else {
      updateData.shareToken = null;
    }
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
  if (!col) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(collectionsTable)
    .where(and(eq(collectionsTable.userId, req.userId), eq(collectionsTable.id, id)));
  res.sendStatus(204);
});

// ── GET /api/collections/:id/movies ─────────────────────────────────────────
router.get("/collections/:id/movies", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const col = await getUserCollection(req.userId, id);
  if (!col) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const movies = await getCollectionOwnerMovies(col);

  res.json(
    movies.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      rating: m.rating ?? null,
      posterPath: m.posterPath ?? null,
      releaseYear: m.releaseYear ?? null,
      originalLanguage: m.originalLanguage ?? null,
      genres: m.genres ?? null,
      tmdbId: m.tmdbId ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

// ── POST /api/collections/:id/movies ─────────────────────────────────────────
router.post("/collections/:id/movies", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { movieId } = req.body ?? {};
  if (!movieId) {
    res.status(400).json({ error: "movieId required" });
    return;
  }

  const col = await getUserCollection(req.userId, id);
  if (!col) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }

  const rules = col.rules as SmartRule[] | null;
  if (Array.isArray(rules) && rules.length > 0) {
    res.status(400).json({ error: "Cannot manually add movies to a smart collection" });
    return;
  }

  const [movie] = await db
    .select({ id: moviesTable.id })
    .from(moviesTable)
    .where(
      and(
        eq(moviesTable.userId, req.userId),
        eq(moviesTable.id, Number(movieId)),
        isNull(moviesTable.deletedAt),
      ),
    );
  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

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
  if (!col) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(collectionMoviesTable)
    .where(
      and(eq(collectionMoviesTable.collectionId, id), eq(collectionMoviesTable.movieId, movieId)),
    );
  res.sendStatus(204);
});

// ── GET /api/movies/:movieId/collections ─────────────────────────────────────
router.get("/movies/:movieId/collections", requireAuth, async (req: any, res): Promise<void> => {
  const movieId = parseInt(req.params.movieId, 10);

  const [movie] = await db
    .select()
    .from(moviesTable)
    .where(
      and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, movieId), isNull(moviesTable.deletedAt)),
    );
  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  const userCols = await db
    .select()
    .from(collectionsTable)
    .where(eq(collectionsTable.userId, req.userId));

  const collectionIds: number[] = [];

  for (const col of userCols) {
    const rules = col.rules as SmartRule[] | null;
    if (Array.isArray(rules) && rules.length > 0) {
      const matches = (await getSmartMovies(req.userId, rules)).some((m) => m.id === movieId);
      if (matches) collectionIds.push(col.id);
    } else {
      const [link] = await db
        .select({ collectionId: collectionMoviesTable.collectionId })
        .from(collectionMoviesTable)
        .where(
          and(
            eq(collectionMoviesTable.movieId, movieId),
            eq(collectionMoviesTable.collectionId, col.id),
          ),
        );
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
    const { field, value } = r as { field?: unknown; value?: unknown };
    if (!validFields.has(field as string) || typeof value !== "string" || !value) return false;
  }
  return rules as SmartRule[];
}

export default router;
