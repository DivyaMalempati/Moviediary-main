import { Router, type IRouter } from "express";
import { desc, sql, eq, and, isNotNull } from "drizzle-orm";
import { db, moviesTable, userPreferencesTable } from "@workspace/db";
import { GetAiSuggestionsBody } from "@workspace/api-zod";
import { getSimilarMovies, getRecommendations, discoverMovies, getTrending } from "../lib/tmdb.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

async function getUserPrefs(userId: string): Promise<{
  preferredLanguages: string[];
  mutedGenres: string[];
  maxCertification: string | null;
  dismissedTmdbIds: number[];
}> {
  const [prefs] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));
  return {
    preferredLanguages: prefs?.preferredLanguages ?? [],
    mutedGenres: prefs?.mutedGenres ?? [],
    maxCertification: prefs?.maxCertification ?? null,
    dismissedTmdbIds: prefs?.dismissedTmdbIds ?? [],
  };
}

function notDismissed<T extends { tmdbId?: number | null }>(
  items: T[],
  dismissed: number[],
): T[] {
  if (!dismissed.length) return items;
  const set = new Set(dismissed);
  return items.filter((m) => m.tmdbId == null || !set.has(m.tmdbId));
}

async function getUserPreferredLanguages(userId: string): Promise<string[]> {
  return (await getUserPrefs(userId)).preferredLanguages;
}

function withoutMutedGenres<T extends { genres?: string[] | null }>(
  items: T[],
  muted: string[],
): T[] {
  if (!muted.length) return items;
  const set = new Set(muted.map((g) => g.toLowerCase()));
  return items.filter((m) => {
    const genres = m.genres ?? [];
    if (genres.length === 0) return true;
    return !genres.some((g) => set.has(g.toLowerCase()));
  });
}

/** All TMDB IDs already in the user's library (watched + watchlist). */
async function getLibraryTmdbIds(userId: string): Promise<Set<number>> {
  const rows = await db
    .select({ tmdbId: moviesTable.tmdbId })
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, userId), isNotNull(moviesTable.tmdbId)));
  return new Set(rows.map((r) => r.tmdbId).filter((id): id is number => id != null));
}

function notInLibrary<T extends { tmdbId?: number | null }>(
  items: T[],
  libraryIds: Set<number>,
): T[] {
  return items.filter((m) => m.tmdbId == null || !libraryIds.has(m.tmdbId));
}

// GET /suggestions/because-you-liked
router.get("/suggestions/because-you-liked", requireAuth, async (req: any, res): Promise<void> => {
  const RATING_ORDER = ["loved", "great", "very_good", "good", "ok", "avg", "meh"];
  const [prefs, libraryIds] = await Promise.all([
    getUserPrefs(req.userId),
    getLibraryTmdbIds(req.userId),
  ]);
  const preferredLangs = prefs.preferredLanguages;

  const watched = await db
    .select()
    .from(moviesTable)
    .where(sql`${moviesTable.userId} = ${req.userId} AND ${moviesTable.status} = 'watched' AND ${moviesTable.tmdbId} IS NOT NULL`)
    .orderBy(desc(moviesTable.createdAt))
    .limit(20);

  const sorted = watched.sort((a, b) => {
    const ai = a.rating ? RATING_ORDER.indexOf(a.rating) : 999;
    const bi = b.rating ? RATING_ORDER.indexOf(b.rating) : 999;
    return ai - bi;
  });

  const topMovies = sorted.slice(0, 5);
  if (topMovies.length === 0) {
    res.json([]);
    return;
  }

  const seen = new Set<number>();
  const suggestions: any[] = [];

  for (const movie of topMovies) {
    if (!movie.tmdbId) continue;
    try {
      const [similar, recs] = await Promise.all([
        getSimilarMovies(movie.tmdbId),
        getRecommendations(movie.tmdbId),
      ]);
      const combined = withoutMutedGenres([...similar, ...recs], prefs.mutedGenres);

      // Sort: user's preferred languages first, then by vote average
      combined.sort((a, b) => {
        const aPreferred = preferredLangs.length === 0 || preferredLangs.includes(a.originalLanguage ?? "");
        const bPreferred = preferredLangs.length === 0 || preferredLangs.includes(b.originalLanguage ?? "");
        if (aPreferred && !bPreferred) return -1;
        if (!aPreferred && bPreferred) return 1;
        return (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
      });

      const dismissed = new Set(prefs.dismissedTmdbIds);
      for (const m of combined) {
        if (!m.tmdbId || seen.has(m.tmdbId) || libraryIds.has(m.tmdbId) || dismissed.has(m.tmdbId)) continue;
        seen.add(m.tmdbId);
        suggestions.push(m);
        if (suggestions.length >= 20) break;
      }
      if (suggestions.length >= 20) break;
    } catch (err) {
      logger.warn({ err, tmdbId: movie.tmdbId }, "Failed to get similar movies");
    }
  }

  res.json(notDismissed(suggestions, prefs.dismissedTmdbIds).slice(0, 20));
});

// ---------------------------------------------------------------------------
// TMDB-based fallback used when Gemini is unavailable or library is empty
// ---------------------------------------------------------------------------
async function getTmdbFallback(userId: string, preferredLangs: string[], mutedGenres: string[] = []): Promise<any[]> {
  const [watched, libraryIds, prefs] = await Promise.all([
    db
      .select()
      .from(moviesTable)
      .where(sql`${moviesTable.userId} = ${userId} AND ${moviesTable.status} = 'watched' AND ${moviesTable.tmdbId} IS NOT NULL`)
      .orderBy(desc(moviesTable.createdAt))
      .limit(10),
    getLibraryTmdbIds(userId),
    getUserPrefs(userId),
  ]);
  const dismissed = new Set(prefs.dismissedTmdbIds);

  // If no watch history, discover by preferences (or trending if no preferences)
  if (watched.length === 0) {
    const discovered = preferredLangs.length > 0
      ? await discoverMovies(preferredLangs)
      : await getTrending();
    return notDismissed(
      withoutMutedGenres(notInLibrary(discovered, libraryIds), mutedGenres),
      prefs.dismissedTmdbIds,
    )
      .slice(0, 10)
      .map((m) => ({ ...m, source: "tmdb" }));
  }

  const seeds = watched.slice(0, 3);
  const seen = new Set<number>();
  const results: any[] = [];

  for (const seed of seeds) {
    if (!seed.tmdbId) continue;
    try {
      const [similar, recs] = await Promise.all([
        getSimilarMovies(seed.tmdbId),
        getRecommendations(seed.tmdbId),
      ]);
      const combined = withoutMutedGenres([...similar, ...recs], mutedGenres)
        .filter((m) => m.tmdbId && !libraryIds.has(m.tmdbId) && !dismissed.has(m.tmdbId))
        .filter((m) => preferredLangs.length === 0 || preferredLangs.includes(m.originalLanguage ?? ""))
        .sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));

      for (const m of combined) {
        if (!seen.has(m.tmdbId)) {
          seen.add(m.tmdbId);
          results.push({ ...m, source: "tmdb" });
          if (results.length >= 10) break;
        }
      }
    } catch (err) {
      logger.warn({ err }, "TMDB fallback seed failed");
    }
    if (results.length >= 10) break;
  }

  // Top up with discover if still thin
  if (results.length < 5) {
    const discovered = preferredLangs.length > 0
      ? await discoverMovies(preferredLangs)
      : await getTrending();
    for (const m of withoutMutedGenres(discovered, mutedGenres)) {
      if (!m.tmdbId || seen.has(m.tmdbId) || libraryIds.has(m.tmdbId) || dismissed.has(m.tmdbId)) continue;
      seen.add(m.tmdbId);
      results.push({ ...m, source: "tmdb" });
      if (results.length >= 10) break;
    }
  }

  return results;
}

// POST /suggestions/ai
router.post("/suggestions/ai", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = GetAiSuggestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const count = parsed.data.count ?? 8;
  const [prefs, libraryIds, libraryRows, watchedMovies] = await Promise.all([
    getUserPrefs(req.userId),
    getLibraryTmdbIds(req.userId),
    db
      .select({ title: moviesTable.title, status: moviesTable.status })
      .from(moviesTable)
      .where(eq(moviesTable.userId, req.userId))
      .orderBy(desc(moviesTable.createdAt))
      .limit(40),
    db
      .select()
      .from(moviesTable)
      .where(sql`${moviesTable.userId} = ${req.userId} AND ${moviesTable.status} = 'watched'`)
      .orderBy(desc(moviesTable.createdAt))
      .limit(20),
  ]);
  const preferredLangs = prefs.preferredLanguages;

  if (watchedMovies.length === 0) {
    const fallback = await getTmdbFallback(req.userId, preferredLangs, prefs.mutedGenres);
    res.json(fallback.slice(0, count));
    return;
  }

  const libraryContext = watchedMovies
    .map((m) => `${m.title}${m.rating ? ` (${m.rating})` : ""}${m.originalLanguage ? ` [${m.originalLanguage}]` : ""}`)
    .join(", ");

  const alreadyHave = libraryRows
    .map((m) => m.title)
    .filter(Boolean)
    .slice(0, 30)
    .join(", ");

  const langNote = preferredLangs.length > 0
    ? `The user prefers films in these languages (ISO codes): ${preferredLangs.join(", ")}. Weight your suggestions heavily toward these languages.`
    : "The user has no language preference — suggest across all world cinema.";

  const muteNote = prefs.mutedGenres.length > 0
    ? `Never suggest films in these muted genres: ${prefs.mutedGenres.join(", ")}.`
    : "";

  const prompt = `You are the user's close friend who lives and breathes cinema — warm, enthusiastic, specific, never pretentious. You know their taste intimately from their watch history.

The user has watched: ${libraryContext}

Films already in their library (watched OR watchlist) — DO NOT recommend any of these: ${alreadyHave || "(none)"}

${langNote}
${muteNote}

Recommend exactly ${count} films they would genuinely love and that are NOT already in their library. Mix classics and recent releases (1970 onwards). Think of yourself as sending a personal voice note about each pick — NOT writing a review.

For each film write:
- hook: One punchy opener, max 12 words. Something vivid and specific like "Perfect lazy Sunday watch 🍿" or "This one wrecked me in the best way." Vary the energy — some excited, some intimate, some curious. No generic openers like "A must-watch" or "If you liked X".
- reason: 2–3 warm, personal sentences. Reference something specific from their watch history where natural. Tell them exactly WHY this film fits THEM — not what the film is about. Write like you're texting a friend, not writing a synopsis.
- mood: Array of 2–3 short mood tags. Examples: ["Heartwarming", "Slow burn"], ["Mind-bending", "Unsettling"], ["Feel-good", "Witty"], ["Epic", "Emotional"].

${langNote}

Respond ONLY with a JSON array, no markdown fences, no explanation:
[
  {
    "title": string,
    "year": number,
    "language": string,
    "hook": string,
    "reason": string,
    "mood": string[],
    "posterPath": string | null,
    "tmdbId": number | null
  }
]`;

  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("No Gemini key");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      logger.warn({ status: response.status }, "Gemini unavailable, falling back to TMDB");
      throw new Error(`Gemini ${response.status}`);
    }

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON in Gemini response");

    const suggestions = JSON.parse(jsonMatch[0]) as any[];
    const libraryTitles = new Set(
      libraryRows.map((m) => m.title.trim().toLowerCase()).filter(Boolean),
    );
    const dismissed = new Set(prefs.dismissedTmdbIds);
    const filtered = suggestions.filter((s) => {
      if (s?.tmdbId != null && libraryIds.has(Number(s.tmdbId))) return false;
      if (s?.tmdbId != null && dismissed.has(Number(s.tmdbId))) return false;
      const title = typeof s?.title === "string" ? s.title.trim().toLowerCase() : "";
      if (title && libraryTitles.has(title)) return false;
      return true;
    });

    if (filtered.length === 0) {
      const fallback = await getTmdbFallback(req.userId, preferredLangs, prefs.mutedGenres);
      res.json(fallback.slice(0, count));
      return;
    }

    res.json(filtered.map((s: any) => ({ ...s, source: "ai" })));
  } catch {
    const fallback = await getTmdbFallback(req.userId, preferredLangs, prefs.mutedGenres);
    res.json(fallback.slice(0, count));
  }
});

export default router;
