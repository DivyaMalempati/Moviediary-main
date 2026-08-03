import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db, moviesTable } from "@workspace/db";
import {
  ListMoviesQueryParams,
  CreateMovieBody,
  GetMovieParams,
  UpdateMovieParams,
  UpdateMovieBody,
  DeleteMovieParams,
  MatchMovieToTmdbParams,
  RewatchMovieParams,
  RewatchMovieBody,
} from "@workspace/api-zod";
import { searchMovies, getMovieDetails } from "../../lib/tmdb.js";
import { logger } from "../../lib/logger.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { verifyGuestToken } from "../guest.js";

const router: IRouter = Router();

/**
 * Resolve the guest userId that may be claimed into the signed-in account.
 * Requires a verified guest session token (body.guestToken or x-claim-guest-token).
 */
function resolveClaimGuestId(req: any): string | null {
  const raw =
    (typeof req.body?.guestToken === "string" && req.body.guestToken) ||
    (typeof req.headers["x-claim-guest-token"] === "string" &&
      req.headers["x-claim-guest-token"]) ||
    "";
  if (!raw) return null;
  const guestId = verifyGuestToken(raw);
  if (!guestId || !guestId.startsWith("guest_")) return null;
  return guestId;
}

function toCSVRow(cols: string[]): string {
  return cols.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
}

const VALID_RATINGS = new Set([
  "loved",
  "great",
  "very_good",
  "good",
  "ok",
  "avg",
  "meh",
]);

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Parse watchedAt from the client. Date-only YYYY-MM-DD must not use
 * `new Date("YYYY-MM-DD")` (UTC midnight → previous calendar day in US zones).
 * Store at UTC noon so the day is stable everywhere.
 */
function parseWatchedAt(raw: string | null | undefined): Date | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00.000Z`);
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeRewatchDates(
  value: unknown,
): Date[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((d) => (d instanceof Date ? d : new Date(d as string)))
    .filter((d) => !Number.isNaN(d.getTime()));
}

/** Most recent day among first watch + dated rewatches. */
function latestWatchDate(
  first: Date | null | undefined,
  rewatches: Date[],
): Date | null {
  let latest: Date | null = first ?? null;
  for (const d of rewatches) {
    if (!latest || d.getTime() > latest.getTime()) latest = d;
  }
  return latest;
}

function dbMovieToResponse(m: typeof moviesTable.$inferSelect) {
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    rating: m.rating ?? null,
    notes: m.notes ?? null,
    tmdbId: m.tmdbId ?? null,
    posterPath: m.posterPath ?? null,
    releaseYear: m.releaseYear ?? null,
    releaseDate: m.releaseDate ?? null,
    originalLanguage: m.originalLanguage ?? null,
    genres: m.genres ?? null,
    overview: m.overview ?? null,
    firstWatchedAt: toIsoTimestamp(m.firstWatchedAt),
    watchedAt: toIsoTimestamp(m.watchedAt),
    createdAt: toIsoTimestamp(m.createdAt) ?? new Date(0).toISOString(),
    rewatchCount: m.rewatchCount ?? 0,
    rewatchDates: normalizeRewatchDates(m.rewatchDates)
      .map((d) => d.toISOString()),
  };
}

// GET /movies
router.get("/movies", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = ListMoviesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, language, rating } = parsed.data;

  const conditions: any[] = [eq(moviesTable.userId, req.userId)];
  if (status) conditions.push(eq(moviesTable.status, status));
  if (language) conditions.push(eq(moviesTable.originalLanguage, language));
  if (rating) conditions.push(eq(moviesTable.rating, rating));

  const movies = await db
    .select()
    .from(moviesTable)
    .where(and(...conditions))
    .orderBy(desc(moviesTable.createdAt));

  res.json(movies.map(dbMovieToResponse));
});

// POST /movies
router.post("/movies", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateMovieBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  // Guard: reject duplicates per user
  if (data.tmdbId != null) {
    const existing = await db
      .select()
      .from(moviesTable)
      .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.tmdbId, data.tmdbId)))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Movie already in library", movie: dbMovieToResponse(existing[0]) });
      return;
    }
  }

  // watchedAt / firstWatchedAt: omit → now (first log default); null → unknown; string → that day.
  let watchedAt: Date | null = null;
  if (data.status === "watched") {
    if ("watchedAt" in data) {
      watchedAt = data.watchedAt ? parseWatchedAt(data.watchedAt) : null;
    } else {
      watchedAt = new Date();
    }
  }

  const [movie] = await db
    .insert(moviesTable)
    .values({
      userId: req.userId,
      title: data.title,
      status: data.status,
      rating: data.rating ?? null,
      notes: data.notes ?? null,
      tmdbId: data.tmdbId ?? null,
      posterPath: data.posterPath ?? null,
      releaseYear: data.releaseYear ?? null,
      releaseDate: data.releaseDate ?? null,
      originalLanguage: data.originalLanguage ?? null,
      genres: data.genres ?? null,
      overview: data.overview ?? null,
      firstWatchedAt: watchedAt,
      watchedAt,
    })
    .returning();

  res.status(201).json(dbMovieToResponse(movie));
});

// GET /movies/stats — must come before /:id
router.get("/movies/stats", requireAuth, async (req: any, res): Promise<void> => {
  const userCond = eq(moviesTable.userId, req.userId);

  const [watchedCount, watchlistCount, byLanguage, byRating, recentlyWatched, allWatched] = await Promise.all([
    db.select({ count: count() }).from(moviesTable).where(and(userCond, eq(moviesTable.status, "watched"))).then((r) => r[0]),
    db.select({ count: count() }).from(moviesTable).where(and(userCond, eq(moviesTable.status, "watchlist"))).then((r) => r[0]),
    db.select({ key: moviesTable.originalLanguage, count: count() })
      .from(moviesTable)
      .where(and(userCond, eq(moviesTable.status, "watched")))
      .groupBy(moviesTable.originalLanguage)
      .orderBy(desc(count())),
    db.select({ key: moviesTable.rating, count: count() })
      .from(moviesTable)
      .where(and(userCond, eq(moviesTable.status, "watched")))
      .groupBy(moviesTable.rating)
      .orderBy(desc(count())),
    db.select().from(moviesTable).where(and(userCond, eq(moviesTable.status, "watched"))).orderBy(desc(moviesTable.createdAt)).limit(6),
    db.select({
      genres: moviesTable.genres,
      createdAt: moviesTable.createdAt,
      watchedAt: moviesTable.watchedAt,
      releaseYear: moviesTable.releaseYear,
      rewatchCount: moviesTable.rewatchCount,
      rating: moviesTable.rating,
    })
      .from(moviesTable)
      .where(and(userCond, eq(moviesTable.status, "watched"))),
  ]);

  // Compute genre counts from the genres array in JS
  const genreCounts: Record<string, number> = {};
  for (const row of allWatched) {
    for (const g of (row.genres ?? [])) {
      genreCounts[g] = (genreCounts[g] ?? 0) + 1;
    }
  }
  const byGenre = Object.entries(genreCounts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  // Monthly counts use actual watch day only — never log day (createdAt).
  // Unknown watchedAt (backfill "not sure") is omitted from month buckets.
  const monthCounts: Record<string, number> = {};
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let thisMonth = 0;
  let totalRewatches = 0;
  let lovedCount = 0;
  let highlyRatedCount = 0;
  const decadeCounts: Record<string, number> = {};

  for (const row of allWatched) {
    if (row.watchedAt) {
      const d = row.watchedAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCounts[key] = (monthCounts[key] ?? 0) + 1;
      if (key === thisMonthKey) thisMonth += 1;
    }

    totalRewatches += row.rewatchCount ?? 0;
    if (row.rating === "loved") lovedCount += 1;
    if (row.rating === "loved" || row.rating === "great") highlyRatedCount += 1;

    if (row.releaseYear && row.releaseYear >= 1900 && row.releaseYear <= 2100) {
      const decadeStart = Math.floor(row.releaseYear / 10) * 10;
      const decadeKey = `${decadeStart}s`;
      decadeCounts[decadeKey] = (decadeCounts[decadeKey] ?? 0) + 1;
    }
  }
  const byMonth = Object.entries(monthCounts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const byDecade = Object.entries(decadeCounts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));

  res.json({
    totalWatched: Number(watchedCount.count),
    totalWatchlist: Number(watchlistCount.count),
    totalRewatches,
    thisMonth,
    lovedCount,
    highlyRatedCount,
    byLanguage: byLanguage.map((r) => ({ key: r.key ?? "unknown", count: Number(r.count) })),
    byRating: byRating.filter((r) => r.key).map((r) => ({ key: r.key!, count: Number(r.count) })),
    byGenre,
    byMonth,
    byDecade,
    recentlyWatched: recentlyWatched.map(dbMovieToResponse),
  });
});

// POST /movies/match-all — must come before /:id
router.post("/movies/match-all", requireAuth, async (req: any, res): Promise<void> => {
  const unmatched = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), sql`${moviesTable.tmdbId} is null`));

  let matched = 0;
  let failed = 0;

  for (const movie of unmatched) {
    try {
      const results = await searchMovies(movie.title, "IN");
      if (results.length > 0) {
        const best = results[0];
        await db
          .update(moviesTable)
          .set({
            tmdbId: best.tmdbId,
            posterPath: best.posterPath,
            releaseYear: best.releaseYear,
            originalLanguage: best.originalLanguage,
            genres: best.genres ?? null,
            overview: best.overview,
          })
          .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, movie.id)));
        matched++;
      } else {
        failed++;
      }
    } catch (err) {
      logger.warn({ err, movieId: movie.id }, "Failed to match movie");
      failed++;
    }
  }

  res.json({ matched, failed, total: unmatched.length });
});

// ── Static /movies/* paths — must be registered before /movies/:id ───────────

// POST /movies/claim-orphaned
router.post("/movies/claim-orphaned", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.userId as string;
  if (userId.startsWith("guest_")) {
    res.status(400).json({
      error: "Sign in to claim guest movies",
      claimed: 0,
    });
    return;
  }

  const guestId = resolveClaimGuestId(req);
  if (!guestId) {
    res.status(400).json({
      error: "A valid guest session token is required to claim movies",
      claimed: 0,
    });
    return;
  }

  const result = await db
    .update(moviesTable)
    .set({ userId })
    .where(eq(moviesTable.userId, guestId))
    .returning({ id: moviesTable.id });

  res.json({ claimed: result.length });
});

// GET /movies/orphaned-count
router.get("/movies/orphaned-count", requireAuth, async (req: any, res): Promise<void> => {
  const guestId = resolveClaimGuestId(req);
  if (!guestId) {
    res.json({ count: 0 });
    return;
  }

  const [{ count: n }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(moviesTable)
    .where(eq(moviesTable.userId, guestId));

  res.json({ count: Number(n) });
});

// GET /movies/export — library CSV (watched + watchlist)
router.get("/movies/export", requireAuth, async (req: any, res): Promise<void> => {
  const movies = await db
    .select()
    .from(moviesTable)
    .where(eq(moviesTable.userId, req.userId))
    .orderBy(moviesTable.createdAt);

  const header = "title,status,rating,year,language";
  const rows = movies.map((m) =>
    toCSVRow([
      m.title,
      m.status,
      m.rating ?? "",
      String(m.releaseYear ?? ""),
      m.originalLanguage ?? "",
    ]),
  );
  const csv = [header, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="cinevault_library.csv"');
  res.send(csv);
});

// GET /movies/export-orphaned — CSV for the pending guest session only
router.get("/movies/export-orphaned", requireAuth, async (req: any, res): Promise<void> => {
  const guestId = resolveClaimGuestId(req);
  if (!guestId) {
    res.status(400).json({ error: "A valid guest session token is required to export" });
    return;
  }

  const movies = await db
    .select()
    .from(moviesTable)
    .where(eq(moviesTable.userId, guestId))
    .orderBy(moviesTable.createdAt);

  const header = "title,status,rating,year,language";
  const rows = movies.map((m) =>
    toCSVRow([
      m.title,
      m.status,
      m.rating ?? "",
      String(m.releaseYear ?? ""),
      m.originalLanguage ?? "",
    ]),
  );
  const csv = [header, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="cinevault_orphaned_movies.csv"');
  res.send(csv);
});

// GET /movies/:id
router.get("/movies/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = GetMovieParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [movie] = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)));

  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  res.json(dbMovieToResponse(movie));
});

// PATCH /movies/:id
router.patch("/movies/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = UpdateMovieParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateMovieBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  const [existing] = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)));

  if (!existing) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  const updateValues: Partial<typeof moviesTable.$inferInsert> = {};

  if (data.title !== undefined) updateValues.title = data.title;
  if (data.status !== undefined) updateValues.status = data.status;
  if ("rating" in data) updateValues.rating = data.rating ?? null;
  if ("notes" in data) updateValues.notes = data.notes ?? null;
  if ("tmdbId" in data) updateValues.tmdbId = data.tmdbId ?? null;
  if ("posterPath" in data) updateValues.posterPath = data.posterPath ?? null;
  if ("releaseYear" in data) updateValues.releaseYear = data.releaseYear ?? null;
  if ("releaseDate" in data) updateValues.releaseDate = data.releaseDate ?? null;
  if ("originalLanguage" in data) updateValues.originalLanguage = data.originalLanguage ?? null;
  if ("genres" in data) updateValues.genres = data.genres ?? null;
  if ("overview" in data) updateValues.overview = data.overview ?? null;
  if ("firstWatchedAt" in data) {
    updateValues.firstWatchedAt = data.firstWatchedAt
      ? parseWatchedAt(data.firstWatchedAt)
      : null;
  }
  if ("watchedAt" in data) {
    updateValues.watchedAt = data.watchedAt ? parseWatchedAt(data.watchedAt) : null;
  }
  if (data.status === "watched" && !("watchedAt" in data) && !("firstWatchedAt" in data)) {
    const now = new Date();
    updateValues.watchedAt = now;
    if (!existing.firstWatchedAt) updateValues.firstWatchedAt = now;
  }

  // Marking watched with a date for the first time: seed firstWatchedAt.
  if (
    (data.status === "watched" || existing.status === "watched") &&
    "watchedAt" in data &&
    !("firstWatchedAt" in data) &&
    !existing.firstWatchedAt &&
    (existing.rewatchCount ?? 0) === 0
  ) {
    updateValues.firstWatchedAt =
      updateValues.watchedAt !== undefined
        ? (updateValues.watchedAt as Date | null)
        : existing.watchedAt;
  }

  if ("rewatchDates" in data && Array.isArray(data.rewatchDates)) {
    if (data.rewatchDates.length > 200) {
      res.status(400).json({ error: "Too many rewatch dates" });
      return;
    }
    const parsedDates: Date[] = [];
    for (const raw of data.rewatchDates) {
      if (typeof raw !== "string") {
        res.status(400).json({ error: "Invalid rewatchDates entry" });
        return;
      }
      const d = parseWatchedAt(raw);
      if (!d) {
        res.status(400).json({ error: "Invalid rewatchDates entry" });
        return;
      }
      parsedDates.push(d);
    }
    updateValues.rewatchDates = parsedDates;
  }

  // Keep last-watched aligned with first + dated rewatches when either changes.
  if (
    ("firstWatchedAt" in data || "rewatchDates" in data) &&
    !("watchedAt" in data)
  ) {
    const nextFirst =
      "firstWatchedAt" in updateValues
        ? (updateValues.firstWatchedAt as Date | null | undefined) ?? null
        : existing.firstWatchedAt;
    const nextRewatches = normalizeRewatchDates(
      "rewatchDates" in updateValues
        ? updateValues.rewatchDates
        : existing.rewatchDates,
    );
    updateValues.watchedAt = latestWatchDate(nextFirst, nextRewatches);
  }

  const [movie] = await db
    .update(moviesTable)
    .set(updateValues)
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)))
    .returning();

  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  res.json(dbMovieToResponse(movie));
});

// POST /movies/:id/rewatch
router.post("/movies/:id/rewatch", requireAuth, async (req: any, res): Promise<void> => {
  const params = RewatchMovieParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = RewatchMovieBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(moviesTable)
      .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)));

    if (!existing) {
      res.status(404).json({ error: "Movie not found" });
      return;
    }

    if (existing.status !== "watched") {
      res.status(400).json({ error: "Only watched movies can be rewatched" });
      return;
    }

    const now = new Date();
    const updateValues: Partial<typeof moviesTable.$inferInsert> = {
      rewatchCount: (existing.rewatchCount ?? 0) + 1,
      // Always refresh last-watched so the diary stays current even for undated rewatches.
      watchedAt: now,
    };

    // Preserve the original watch day before overwriting last-watched.
    if (!existing.firstWatchedAt && existing.watchedAt) {
      updateValues.firstWatchedAt = existing.watchedAt;
    }

    // Optional dated rewatch: append to history (and use that date as last-watched).
    const rawWatchedAt = body.data.watchedAt;
    if (rawWatchedAt != null && String(rawWatchedAt).trim() !== "") {
      const rewatchDate = parseWatchedAt(String(rawWatchedAt));
      if (!rewatchDate) {
        res.status(400).json({ error: "Invalid watchedAt date" });
        return;
      }
      const prevDates = normalizeRewatchDates(existing.rewatchDates);
      updateValues.rewatchDates = [...prevDates, rewatchDate];
      updateValues.watchedAt = rewatchDate;
    }

    if ("rating" in body.data && body.data.rating != null) {
      if (!VALID_RATINGS.has(body.data.rating)) {
        res.status(400).json({ error: "Invalid rating" });
        return;
      }
      updateValues.rating = body.data.rating as typeof moviesTable.$inferInsert.rating;
    }

    const [movie] = await db
      .update(moviesTable)
      .set(updateValues)
      .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)))
      .returning();

    if (!movie) {
      res.status(404).json({ error: "Movie not found" });
      return;
    }

    res.json(dbMovieToResponse(movie));
  } catch (err) {
    logger.error({ err, movieId: params.data.id, userId: req.userId }, "Failed to log rewatch");
    res.status(500).json({ error: "Failed to log rewatch" });
  }
});

// DELETE /movies/:id
router.delete("/movies/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = DeleteMovieParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [movie] = await db
    .delete(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)))
    .returning();

  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  res.sendStatus(204);
});

// POST /movies/:id/match
router.post("/movies/:id/match", requireAuth, async (req: any, res): Promise<void> => {
  const params = MatchMovieToTmdbParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [movie] = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)));

  if (!movie) {
    res.status(404).json({ error: "Movie not found" });
    return;
  }

  const results = await searchMovies(movie.title, "IN");
  if (results.length === 0) {
    res.status(404).json({ error: "No TMDB match found" });
    return;
  }

  const best = results[0];
  const details = await getMovieDetails(best.tmdbId);

  const [updated] = await db
    .update(moviesTable)
    .set({
      tmdbId: details.tmdbId,
      posterPath: details.posterPath,
      releaseYear: details.releaseYear,
      releaseDate: details.releaseDate ?? null,
      originalLanguage: details.originalLanguage,
      genres: details.genres ?? null,
      overview: details.overview,
    })
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)))
    .returning();

  res.json(dbMovieToResponse(updated));
});

export default router;
