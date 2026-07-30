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

const router: IRouter = Router();

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
    originalLanguage: m.originalLanguage ?? null,
    genres: m.genres ?? null,
    overview: m.overview ?? null,
    watchedAt: m.watchedAt ? m.watchedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    rewatchCount: m.rewatchCount ?? 0,
    rewatchDates: (m.rewatchDates ?? []).map((d: Date) => d.toISOString()),
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

  const watchedAt = data.watchedAt ? new Date(data.watchedAt) : (data.status === "watched" ? new Date() : null);

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
      originalLanguage: data.originalLanguage ?? null,
      genres: data.genres ?? null,
      overview: data.overview ?? null,
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
    db.select({ genres: moviesTable.genres, createdAt: moviesTable.createdAt, watchedAt: moviesTable.watchedAt })
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

  // Compute monthly counts from watchedAt (fall back to createdAt when null)
  const monthCounts: Record<string, number> = {};
  for (const row of allWatched) {
    const d = row.watchedAt ?? row.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  }
  const byMonth = Object.entries(monthCounts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));

  res.json({
    totalWatched: Number(watchedCount.count),
    totalWatchlist: Number(watchlistCount.count),
    byLanguage: byLanguage.map((r) => ({ key: r.key ?? "unknown", count: Number(r.count) })),
    byRating: byRating.filter((r) => r.key).map((r) => ({ key: r.key!, count: Number(r.count) })),
    byGenre,
    byMonth,
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
  const updateValues: Partial<typeof moviesTable.$inferInsert> = {};

  if (data.title !== undefined) updateValues.title = data.title;
  if (data.status !== undefined) updateValues.status = data.status;
  if ("rating" in data) updateValues.rating = data.rating ?? null;
  if ("notes" in data) updateValues.notes = data.notes ?? null;
  if ("tmdbId" in data) updateValues.tmdbId = data.tmdbId ?? null;
  if ("posterPath" in data) updateValues.posterPath = data.posterPath ?? null;
  if ("releaseYear" in data) updateValues.releaseYear = data.releaseYear ?? null;
  if ("originalLanguage" in data) updateValues.originalLanguage = data.originalLanguage ?? null;
  if ("genres" in data) updateValues.genres = data.genres ?? null;
  if ("overview" in data) updateValues.overview = data.overview ?? null;
  if ("watchedAt" in data) updateValues.watchedAt = data.watchedAt ? new Date(data.watchedAt) : null;
  if (data.status === "watched" && !("watchedAt" in data)) updateValues.watchedAt = new Date();

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

  const updateValues: Partial<typeof moviesTable.$inferInsert> = {
    rewatchCount: (existing.rewatchCount ?? 0) + 1,
  };

  // Optional dated rewatch: append to history and refresh last-watched.
  // Undated rewatches only bump the count (date logging is optional).
  const rawWatchedAt = body.data.watchedAt;
  if (rawWatchedAt != null && String(rawWatchedAt).trim() !== "") {
    const rewatchDate = new Date(rawWatchedAt);
    if (Number.isNaN(rewatchDate.getTime())) {
      res.status(400).json({ error: "Invalid watchedAt date" });
      return;
    }
    updateValues.rewatchDates = [...(existing.rewatchDates ?? []), rewatchDate];
    updateValues.watchedAt = rewatchDate;
  }

  if ("rating" in body.data) {
    updateValues.rating = body.data.rating ?? null;
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
      originalLanguage: details.originalLanguage,
      genres: details.genres ?? null,
      overview: details.overview,
    })
    .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.id, params.data.id)))
    .returning();

  res.json(dbMovieToResponse(updated));
});

export default router;
