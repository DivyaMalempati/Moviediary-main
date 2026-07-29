import { Router, type IRouter } from "express";
import { db, moviesTable, userPreferencesTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { buildTasteProfile, getPersonalizedSwipePool } from "../lib/personalization.js";

const router: IRouter = Router();

// World-cinema default used only when the user has no watched films AND no
// stated language preference (shouldn't normally happen once onboarding is
// in place, but covers users who skip it).
const WORLD_CINEMA_DEFAULT = ["ml", "ta", "te", "hi", "ko", "ja", "fr", "de", "it", "es", "zh", "fa", "tr", "bn", "kn"];

/**
 * GET /discover/swipe?page=1&genreId=28&excludeIds=603,680&onMyServices=1
 *
 * Personalized batch for the swipe screen. Blends:
 *  - implicit taste learned from rated watch history (once it exists)
 *  - explicit preferences the user stated at onboarding / in settings
 *
 * A brand-new user who just finished onboarding gets a genre/language
 * weighted deck immediately, not a generic popular/iconic fallback.
 *
 * When onMyServices=1 and the user has preferredProviders, discover is
 * filtered to films available on those streaming services tonight.
 */
router.get("/discover/swipe", requireAuth, async (req: any, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
  const genreIdRaw = req.query.genreId as string | undefined;
  const genreIdFilter = genreIdRaw ? parseInt(genreIdRaw, 10) || undefined : undefined;
  const onMyServices =
    req.query.onMyServices === "1" ||
    req.query.onMyServices === "true";

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
  const explicitPrefs = {
    languages: prefsRow[0]?.preferredLanguages ?? [],
    genres: prefsRow[0]?.preferredGenres ?? [],
    ...(onMyServices && preferredProviders.length > 0
      ? {
          providerIds: preferredProviders,
          watchRegion: prefsRow[0]?.watchRegion ?? "IN",
        }
      : {}),
  };

  const pool = await getPersonalizedSwipePool({
    profile,
    explicitPrefs,
    fallbackLanguages: WORLD_CINEMA_DEFAULT,
    page,
    genreIdFilter,
    excludeIds,
  });

  res.json(pool);
});

export default router;
