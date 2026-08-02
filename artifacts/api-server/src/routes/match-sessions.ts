import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  db,
  moviesTable,
  userPreferencesTable,
  partnerLinksTable,
  matchSessionsTable,
  matchSessionSwipesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  buildTasteProfile,
  getPersonalizedSwipePool,
  intersectTasteProfiles,
  type ExplicitPreferences,
  type SwipeCandidate,
} from "../lib/personalization.js";
import { INDIA_COLD_START_LANGUAGES } from "../lib/languageDefaults.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function requireRegistered(req: any, res: any): boolean {
  const userId = req.userId as string;
  if (!userId || userId.startsWith("guest_")) {
    res.status(401).json({ error: "Sign in to use match sessions" });
    return false;
  }
  return true;
}

async function getActivePartnerLink(userId: string) {
  const [link] = await db
    .select()
    .from(partnerLinksTable)
    .where(
      and(
        eq(partnerLinksTable.status, "active"),
        or(
          eq(partnerLinksTable.userLowId, userId),
          eq(partnerLinksTable.userHighId, userId),
        ),
      ),
    )
    .limit(1);
  return link ?? null;
}

/**
 * Persist a Together "like" to the swiper's personal watchlist.
 * Swipe votes alone lived only in match_session_swipes — likes never hit /watchlist.
 * Does not downgrade an existing watched entry.
 */
async function ensureWatchlistEntry(userId: string, film: SwipeCandidate): Promise<void> {
  const existing = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, userId), eq(moviesTable.tmdbId, film.tmdbId)))
    .limit(8);

  const active = existing.find((m) => m.deletedAt == null);
  if (active) {
    return;
  }

  const softDeleted = existing.find((m) => m.deletedAt != null);
  if (softDeleted) {
    await db
      .update(moviesTable)
      .set({
        deletedAt: null,
        status: "watchlist",
        title: film.title,
        posterPath: film.posterPath,
        releaseYear: film.releaseYear,
        originalLanguage: film.originalLanguage,
        overview: film.overview,
        genres: film.genres,
      })
      .where(eq(moviesTable.id, softDeleted.id));
    return;
  }

  await db.insert(moviesTable).values({
    userId,
    title: film.title,
    status: "watchlist",
    tmdbId: film.tmdbId,
    posterPath: film.posterPath,
    releaseYear: film.releaseYear,
    releaseDate: (film as { releaseDate?: string | null }).releaseDate ?? null,
    originalLanguage: film.originalLanguage,
    overview: film.overview,
    genres: film.genres,
  });
}

function partnerOf(link: typeof partnerLinksTable.$inferSelect, userId: string) {
  return link.userLowId === userId ? link.userHighId : link.userLowId;
}

async function loadPrefs(userId: string): Promise<ExplicitPreferences> {
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);
  return {
    languages: row?.preferredLanguages ?? [],
    genres: row?.preferredGenres ?? [],
    providerIds: row?.preferredProviders ?? [],
    watchRegion: row?.watchRegion ?? "IN",
    maxCertification: row?.maxCertification ?? null,
    mutedGenres: row?.mutedGenres ?? [],
  };
}

async function sessionForUser(sessionId: number, userId: string) {
  const [session] = await db
    .select()
    .from(matchSessionsTable)
    .where(eq(matchSessionsTable.id, sessionId))
    .limit(1);
  if (!session) return { error: "not_found" as const };

  const [link] = await db
    .select()
    .from(partnerLinksTable)
    .where(eq(partnerLinksTable.id, session.partnerLinkId))
    .limit(1);
  if (!link || (link.userLowId !== userId && link.userHighId !== userId)) {
    return { error: "forbidden" as const };
  }
  return { session, link };
}

function matchesFromSwipes(
  swipes: Array<typeof matchSessionSwipesTable.$inferSelect>,
  userA: string,
  userB: string,
): number[] {
  const likesA = new Set(
    swipes.filter((s) => s.userId === userA && s.direction === "like").map((s) => s.tmdbId),
  );
  const likesB = new Set(
    swipes.filter((s) => s.userId === userB && s.direction === "like").map((s) => s.tmdbId),
  );
  return [...likesA].filter((id) => likesB.has(id));
}

/**
 * GET /match-sessions
 * List active watch-together sessions for the current partner link.
 */
router.get("/match-sessions", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  const link = await getActivePartnerLink(req.userId);
  if (!link) {
    res.json({ sessions: [] });
    return;
  }

  const sessions = await db
    .select()
    .from(matchSessionsTable)
    .where(
      and(
        eq(matchSessionsTable.partnerLinkId, link.id),
        eq(matchSessionsTable.status, "active"),
      ),
    )
    .orderBy(desc(matchSessionsTable.createdAt))
    .limit(10);

  res.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      deckSize: Array.isArray(s.deck) ? s.deck.length : 0,
      createdAt: s.createdAt.toISOString(),
      path: `/match/${s.id}`,
    })),
  });
});

/**
 * POST /match-sessions
 * Create a shared dual-swipe deck from both people's Preferences + tastes.
 * Common interest is discovered by mutual likes while swiping — not by typing
 * what the other person likes.
 */
router.post("/match-sessions", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  const link = await getActivePartnerLink(req.userId);
  if (!link) {
    res.status(400).json({ error: "Invite someone before starting a movie night" });
    return;
  }

  const partnerUserId = partnerOf(link, req.userId);
  const [profileA, profileB, prefsA, prefsB, libA, libB, dismissA, dismissB] = await Promise.all([
    buildTasteProfile(req.userId),
    buildTasteProfile(partnerUserId),
    loadPrefs(req.userId),
    loadPrefs(partnerUserId),
    db
      .select({ tmdbId: moviesTable.tmdbId })
      .from(moviesTable)
      .where(and(eq(moviesTable.userId, req.userId), isNotNull(moviesTable.tmdbId))),
    db
      .select({ tmdbId: moviesTable.tmdbId })
      .from(moviesTable)
      .where(and(eq(moviesTable.userId, partnerUserId), isNotNull(moviesTable.tmdbId))),
    db
      .select({ dismissedTmdbIds: userPreferencesTable.dismissedTmdbIds })
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, req.userId))
      .limit(1),
    db
      .select({ dismissedTmdbIds: userPreferencesTable.dismissedTmdbIds })
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, partnerUserId))
      .limit(1),
  ]);

  const { profile, explicitPrefs, overlap } = intersectTasteProfiles(
    profileA,
    profileB,
    prefsA,
    prefsB,
  );

  // Both picked genres but share none — don't pretend Horror∪Documentary is "shared".
  if (
    !overlap.genres &&
    prefsA.genres.length > 0 &&
    prefsB.genres.length > 0
  ) {
    res.status(409).json({
      error:
        "No overlapping genres — pick some of the same genres in Preferences, then try again",
      tasteOverlap: overlap,
    });
    return;
  }

  const excludeIds = new Set<number>([
    ...libA.map((m) => m.tmdbId).filter((id): id is number => !!id),
    ...libB.map((m) => m.tmdbId).filter((id): id is number => !!id),
    ...(dismissA[0]?.dismissedTmdbIds ?? []),
    ...(dismissB[0]?.dismissedTmdbIds ?? []),
  ]);

  // Exclude prior Together passes for this pair so the same skips don't resurface.
  const priorSessions = await db
    .select({ id: matchSessionsTable.id })
    .from(matchSessionsTable)
    .where(eq(matchSessionsTable.partnerLinkId, link.id));
  const priorSessionIds = priorSessions.map((s) => s.id);
  if (priorSessionIds.length > 0) {
    const priorPasses = await db
      .select({ tmdbId: matchSessionSwipesTable.tmdbId })
      .from(matchSessionSwipesTable)
      .where(
        and(
          inArray(matchSessionSwipesTable.sessionId, priorSessionIds),
          eq(matchSessionSwipesTable.direction, "pass"),
        ),
      );
    for (const row of priorPasses) excludeIds.add(row.tmdbId);
  }

  const deck = await getPersonalizedSwipePool({
    profile,
    explicitPrefs,
    fallbackLanguages: [...INDIA_COLD_START_LANGUAGES],
    page: 1,
    excludeIds,
    // Recent underrated titles in shared genres first (not popular safe hits).
    mode: "together",
  });

  const [session] = await db
    .insert(matchSessionsTable)
    .values({
      partnerLinkId: link.id,
      createdByUserId: req.userId,
      status: "active",
      deck,
    })
    .returning();

  res.status(201).json({
    id: session.id,
    partnerLinkId: session.partnerLinkId,
    partnerUserId,
    status: session.status,
    deck,
    tasteOverlap: overlap,
    createdAt: session.createdAt.toISOString(),
  });
});

/** GET /match-sessions/:id */
router.get("/match-sessions/:id", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const result = await sessionForUser(id, req.userId);
  if ("error" in result) {
    res.status(result.error === "not_found" ? 404 : 403).json({ error: "Session not found" });
    return;
  }

  const { session, link } = result;
  const partnerUserId = partnerOf(link, req.userId);
  const swipes = await db
    .select()
    .from(matchSessionSwipesTable)
    .where(eq(matchSessionSwipesTable.sessionId, session.id));

  const matchedTmdbIds = matchesFromSwipes(swipes, req.userId, partnerUserId);
  const deck = session.deck as SwipeCandidate[];
  const matches = deck.filter((c) => matchedTmdbIds.includes(c.tmdbId));

  res.json({
    id: session.id,
    partnerLinkId: session.partnerLinkId,
    partnerUserId,
    meUserId: req.userId,
    status: session.status,
    deck,
    swipes: swipes.map((s) => ({
      userId: s.userId,
      tmdbId: s.tmdbId,
      direction: s.direction,
      createdAt: s.createdAt.toISOString(),
    })),
    matches,
    mySwipeCount: swipes.filter((s) => s.userId === req.userId).length,
    partnerSwipeCount: swipes.filter((s) => s.userId === partnerUserId).length,
    createdAt: session.createdAt.toISOString(),
  });
});

/**
 * POST /match-sessions/:id/swipes  { tmdbId, direction: "like" | "pass" }
 * Returns { matched: boolean, film? } when both partners liked the same title.
 */
router.post("/match-sessions/:id/swipes", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const tmdbId = Number(req.body?.tmdbId);
  const direction = req.body?.direction === "like" ? "like" : req.body?.direction === "pass" ? "pass" : null;
  if (!tmdbId || !direction) {
    res.status(400).json({ error: "tmdbId and direction (like|pass) required" });
    return;
  }

  const result = await sessionForUser(id, req.userId);
  if ("error" in result) {
    res.status(result.error === "not_found" ? 404 : 403).json({ error: "Session not found" });
    return;
  }
  const { session, link } = result;
  if (session.status !== "active") {
    res.status(400).json({ error: "Session is not active" });
    return;
  }

  const deck = session.deck as SwipeCandidate[];
  const film = deck.find((c) => c.tmdbId === tmdbId);
  if (!film) {
    res.status(400).json({ error: "Film not in this session deck" });
    return;
  }

  await db
    .insert(matchSessionSwipesTable)
    .values({
      sessionId: session.id,
      userId: req.userId,
      tmdbId,
      direction,
    })
    .onConflictDoUpdate({
      target: [
        matchSessionSwipesTable.sessionId,
        matchSessionSwipesTable.userId,
        matchSessionSwipesTable.tmdbId,
      ],
      set: { direction },
    });

  let matched = false;
  let addedToWatchlist = false;
  if (direction === "like") {
    try {
      await ensureWatchlistEntry(req.userId, film);
      addedToWatchlist = true;
    } catch (err) {
      // Swipe vote already saved — don't fail the ritual if library write races.
      logger.warn({ err }, "Together like → watchlist failed");
    }

    const partnerUserId = partnerOf(link, req.userId);
    const [partnerSwipe] = await db
      .select()
      .from(matchSessionSwipesTable)
      .where(
        and(
          eq(matchSessionSwipesTable.sessionId, session.id),
          eq(matchSessionSwipesTable.userId, partnerUserId),
          eq(matchSessionSwipesTable.tmdbId, tmdbId),
          eq(matchSessionSwipesTable.direction, "like"),
        ),
      )
      .limit(1);
    matched = !!partnerSwipe;
  }

  res.json({ matched, film: matched ? film : null, addedToWatchlist });
});

/**
 * POST /match-sessions/:id/log-match  { tmdbId, rating?, watchedAt? }
 * Opt-in diary write for the requesting user only (partner logs separately).
 * Mutual likes already land on each person's watchlist via /swipes.
 */
router.post("/match-sessions/:id/log-match", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;
  const id = parseInt(req.params.id, 10);
  const tmdbId = Number(req.body?.tmdbId);
  const rating = typeof req.body?.rating === "string" ? req.body.rating : null;
  const watchedAtRaw = req.body?.watchedAt;
  let watchedAt: Date | null = new Date();
  if (watchedAtRaw === null) {
    watchedAt = null;
  } else if (typeof watchedAtRaw === "string" && watchedAtRaw) {
    const d = new Date(watchedAtRaw);
    watchedAt = Number.isNaN(d.getTime()) ? new Date() : d;
  }
  if (!id || !tmdbId) {
    res.status(400).json({ error: "session id and tmdbId required" });
    return;
  }

  const result = await sessionForUser(id, req.userId);
  if ("error" in result) {
    res.status(result.error === "not_found" ? 404 : 403).json({ error: "Session not found" });
    return;
  }
  const { session, link } = result;
  const partnerUserId = partnerOf(link, req.userId);
  const deck = session.deck as SwipeCandidate[];
  const film = deck.find((c) => c.tmdbId === tmdbId);
  if (!film) {
    res.status(400).json({ error: "Film not in this session deck" });
    return;
  }

  const swipes = await db
    .select()
    .from(matchSessionSwipesTable)
    .where(eq(matchSessionSwipesTable.sessionId, session.id));
  const matchedIds = matchesFromSwipes(swipes, req.userId, partnerUserId);
  if (!matchedIds.includes(tmdbId)) {
    res.status(400).json({ error: "Both partners must like this film first" });
    return;
  }

  const userId = req.userId as string;
  const existing = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, userId), eq(moviesTable.tmdbId, tmdbId)))
    .limit(1);

  if (existing[0]) {
    if (existing[0].status !== "watched") {
      await db
        .update(moviesTable)
        .set({
          status: "watched",
          watchedAt,
          ...(rating ? { rating: rating as any } : {}),
        })
        .where(eq(moviesTable.id, existing[0].id));
    } else if (rating) {
      await db
        .update(moviesTable)
        .set({ rating: rating as any })
        .where(eq(moviesTable.id, existing[0].id));
    }
  } else {
    await db.insert(moviesTable).values({
      userId,
      title: film.title,
      status: "watched",
      tmdbId: film.tmdbId,
      posterPath: film.posterPath,
      releaseYear: film.releaseYear,
      releaseDate: (film as { releaseDate?: string | null }).releaseDate ?? null,
      originalLanguage: film.originalLanguage,
      overview: film.overview,
      genres: film.genres,
      watchedAt,
      ...(rating ? { rating: rating as any } : {}),
    });
  }

  res.json({ ok: true, loggedFor: [userId], film });
});

export default router;
