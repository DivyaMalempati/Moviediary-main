import { Router, type IRouter } from "express";
import { db, moviesTable, userPreferencesTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { buildTasteProfile, getPersonalizedSwipePool } from "../lib/personalization.js";
import { INDIA_COLD_START_LANGUAGES } from "../lib/languageDefaults.js";
import { tropeBySlug } from "../lib/tropes.js";

const router: IRouter = Router();

/**
 * GET /discover/swipe?page=1&genreId=28&excludeIds=603,680&onMyServices=1&keywordId=10051&trope=heist
 *
 * Personalized 10–12 card deck with 60/20/20 mix:
 *  - 60% Safe Matches (top genre / seed taste)
 *  - 20% Contextual streaming (high-rated on OTT apps)
 *  - 20% Wildcard hidden gems (vote_average ≥ 7.2, vote_count ≤ 3000)
 */
router.get("/discover/swipe", requireAuth, async (req: any, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
  const genreIdRaw = req.query.genreId as string | undefined;
  const genreIdFilter = genreIdRaw ? parseInt(genreIdRaw, 10) || undefined : undefined;
  const onMyServices =
    req.query.onMyServices === "1" ||
    req.query.onMyServices === "true";

  const tropeSlug = (req.query.trope as string | undefined)?.trim();
  const keywordIdRaw = req.query.keywordId as string | undefined;
  let keywordId = keywordIdRaw ? parseInt(keywordIdRaw, 10) || undefined : undefined;
  if (tropeSlug) {
    const trope = tropeBySlug(tropeSlug);
    if (trope) keywordId = trope.keywordId;
  }

  const excludeIdsRaw = req.query.excludeIds as string | undefined;
  const clientExcluded = excludeIdsRaw
    ? excludeIdsRaw.split(",").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n))
    : [];

  const [library, prefsRow, profile] = await Promise.all([
    db
      .select({ tmdbId: moviesTable.tmdbId })
      .from(moviesTable)
      .where(and(eq(moviesTable.userId, req.userId), isNotNull(moviesTable.tmdbId))),
    db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, req.userId)),
    buildTasteProfile(req.userId),
  ]);

  const excludeIds = new Set<number>([
    ...library.map((m) => m.tmdbId).filter((id): id is number => !!id),
    ...clientExcluded,
  ]);

  const preferredProviders = prefsRow[0]?.preferredProviders ?? [];
  // Streaming 20% bucket uses preferred providers whenever configured.
  // onMyServices remains available for clients that want OTT-only decks later.
  const explicitPrefs = {
    languages: prefsRow[0]?.preferredLanguages ?? [],
    genres: prefsRow[0]?.preferredGenres ?? [],
    maxCertification: prefsRow[0]?.maxCertification ?? null,
    mutedGenres: prefsRow[0]?.mutedGenres ?? [],
    ...(preferredProviders.length > 0
      ? {
          providerIds: preferredProviders,
          watchRegion: prefsRow[0]?.watchRegion ?? "IN",
        }
      : onMyServices
        ? {}
        : {}),
  };

  const pool = await getPersonalizedSwipePool({
    profile,
    explicitPrefs,
    fallbackLanguages: [...INDIA_COLD_START_LANGUAGES],
    page,
    genreIdFilter,
    keywordId,
    excludeIds,
  });

  res.json(pool);
});

export default router;
