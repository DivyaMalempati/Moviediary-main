import { Router, type IRouter } from "express";
import { db, moviesTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { buildTasteProfile, getPersonalizedSwipePool } from "../lib/personalization.js";

const router: IRouter = Router();

// World-cinema default used only when the user has no watched films at all
// yet (cold start) and hasn't set a language preference either.
const WORLD_CINEMA_DEFAULT = ["ml", "ta", "te", "hi", "ko", "ja", "fr", "de", "it", "es", "zh", "fa", "tr", "bn", "kn"];

/**
 * GET /discover/swipe?page=1&genreId=28&excludeIds=603,680
 *
 * Returns a personalized batch of films for the swipe screen, built from:
 *  - "similar to" / "recommended because of" the user's top-rated films (strongest signal)
 *  - discover results weighted toward the user's top-rated genres + languages
 *  - a small slice of acclaimed/iconic films and a small slice of latest/trending,
 *    so discovery and new releases still surface, just not as the majority
 *
 * Falls back to the old popular+iconic behavior if the user hasn't rated
 * anything yet — there's no taste signal to personalize from.
 */
router.get("/discover/swipe", requireAuth, async (req: any, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
  const genreIdRaw = req.query.genreId as string | undefined;
  const genreIdFilter = genreIdRaw ? parseInt(genreIdRaw, 10) || undefined : undefined;

  // Client sends the films it's already shown/skipped this session (see
  // swipe.tsx `seenRef`) so we can exclude them at the TMDB-fetch stage
  // instead of only filtering client-side after the round trip.
  const excludeIdsRaw = req.query.excludeIds as string | undefined;
  const clientExcluded = excludeIdsRaw
    ? excludeIdsRaw.split(",").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n))
    : [];

  const library = await db
    .select({ tmdbId: moviesTable.tmdbId })
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, req.userId), isNotNull(moviesTable.tmdbId)));

  const excludeIds = new Set<number>([...library.map((m) => m.tmdbId).filter((id): id is number => !!id), ...clientExcluded]);

  const profile = await buildTasteProfile(req.userId);

  const pool = await getPersonalizedSwipePool({
    userId: req.userId,
    profile,
    fallbackLanguages: WORLD_CINEMA_DEFAULT,
    page,
    genreIdFilter,
    excludeIds,
  });

  res.json(pool);
});

export default router;
