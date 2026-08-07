import { Router, type IRouter } from "express";
import { db, moviesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { searchMovies, getMovieDetails } from "../lib/tmdb.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const VALID_STATUSES = new Set(["watched", "watchlist"]);
const VALID_RATINGS = new Set(["loved", "great", "very_good", "good", "ok", "avg", "meh"]);

// ── CSV / bulk import ────────────────────────────────────────────────────────

interface ImportRow {
  title: string;
  status: "watched" | "watchlist";
  rating?: string;
  year?: number;
  /** Optional watch day from the uploaded list (YYYY-MM-DD or ISO). */
  watchedAt?: string;
}

/** Date-only → UTC noon so the calendar day is stable across zones. */
function parseDateOnly(raw: string | null | undefined): Date | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00.000Z`);
  }
  if (/^\d{4}$/.test(trimmed)) {
    return new Date(`${trimmed}-01-01T12:00:00.000Z`);
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return new Date(`${key}T12:00:00.000Z`);
}

/** Don't store a future watch day (release dates can be upcoming). */
function clampToToday(d: Date): Date {
  const today = startOfTodayUtc();
  return d.getTime() > today.getTime() ? today : d;
}

/**
 * Import lists rarely include a real watch day. Prefer an explicit date from
 * the row; otherwise backfill from TMDB release day (then year), else today.
 */
function resolveImportWatchedAt(opts: {
  watchedAtRaw?: string;
  releaseDate?: string | null;
  releaseYear?: number | null;
}): Date {
  const fromRow = parseDateOnly(opts.watchedAtRaw);
  if (fromRow) return clampToToday(fromRow);

  const fromRelease = parseDateOnly(opts.releaseDate ?? undefined);
  if (fromRelease) return clampToToday(fromRelease);

  if (opts.releaseYear && opts.releaseYear >= 1900 && opts.releaseYear <= 2100) {
    return clampToToday(new Date(`${opts.releaseYear}-01-01T12:00:00.000Z`));
  }

  return new Date();
}

function parseRows(rows: unknown[]): ImportRow[] {
  return rows
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      title: String(r.title ?? "").trim(),
      status: VALID_STATUSES.has(String(r.status).trim().toLowerCase())
        ? (String(r.status).trim().toLowerCase() as "watched" | "watchlist")
        : "watched",
      rating: (() => {
        const raw = String(r.rating ?? "").trim().toLowerCase();
        if (VALID_RATINGS.has(raw)) return raw;
        // Accept numeric 1-10 → map to nearest label
        const n = parseFloat(raw);
        if (!isNaN(n)) {
          if (n >= 9.5) return "loved";
          if (n >= 8.5) return "great";
          if (n >= 7.5) return "very_good";
          if (n >= 6)   return "good";
          if (n >= 4.5) return "ok";
          if (n >= 3)   return "avg";
          if (n >= 1)   return "meh";
        }
        return undefined;
      })(),
      year: r.year ? parseInt(String(r.year), 10) || undefined : undefined,
      watchedAt: (() => {
        const raw =
          r.watchedAt ?? r.watched_at ?? r.watched ?? r.date ?? r.watch_date;
        if (raw == null || String(raw).trim() === "") return undefined;
        return String(raw).trim();
      })(),
    }))
    .filter((r) => r.title.length > 0);
}

// ── Title matching helpers ────────────────────────────────────────────────────
type SearchHit = Awaited<ReturnType<typeof searchMovies>>[number];

/** Normalise a title for comparison: lowercase, strip punctuation, collapse whitespace */
function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Strip emoji characters */
function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score a TMDB result against the user's query title.
 * Higher = better match. Does NOT strip the query — we want to reward full-title matches.
 */
function titleScore(query: string, hit: SearchHit): number {
  const q = normTitle(query);
  const candidates = [normTitle(hit.title)];
  if (hit.originalTitle) candidates.push(normTitle(hit.originalTitle));

  let best = 0;
  for (const c of candidates) {
    if (c === q) { best = Math.max(best, 1.0); continue; }

    // Jaccard word similarity
    const qWords = new Set(q.split(" ").filter(Boolean));
    const cWords = new Set(c.split(" ").filter(Boolean));
    const intersection = [...qWords].filter((w) => cWords.has(w)).length;
    const union = new Set([...qWords, ...cWords]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    best = Math.max(best, jaccard);
  }
  return best;
}

/**
 * Pick the best match from a results array.
 * Ranks by title similarity to the query, boosting year matches.
 * Falls back to TMDB's own ordering (index 0) only when similarity is equal.
 */
function pickBest(results: SearchHit[], query: string, year?: number): SearchHit | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const scored = results.map((hit, idx) => {
    let score = titleScore(query, hit);
    if (year && hit.releaseYear === year) score += 0.5;   // strong year signal
    score -= idx * 0.005;                                  // slight TMDB-order tiebreak
    return { hit, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].hit;
}

// ── Search with fallback strategy ────────────────────────────────────────────
// Keeps the full title intact through all tries — only strips user annotations
// (emojis, parenthetical notes) that are obviously not part of the movie name.
// Never strips subtitle phrases like "The Rise" from "Pushpa: The Rise" —
// that would match the wrong film.
async function searchWithFallback(rawTitle: string, year?: number): Promise<SearchHit | null> {
  // 0. Always clean emojis first
  const title = stripEmoji(rawTitle);

  // 1. Full cleaned title
  const r1 = await searchMovies(title);
  const b1 = pickBest(r1, title, year);
  if (b1 && titleScore(title, b1) >= 0.5) return b1;   // only accept if reasonably similar

  // 2. Strip parenthetical user annotations  e.g. "Dark (director name)" → "Dark"
  //    Parenthetical content in user lists is almost always a personal note, not the title.
  const noParens = title.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (noParens && noParens !== title) {
    const r2 = await searchMovies(noParens);
    const b2 = pickBest(r2, noParens, year);
    if (b2 && titleScore(noParens, b2) >= 0.5) return b2;
  }

  // 3. Collapse dots  e.g. "K.G.F." → "KGF"
  const noDots = title.replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (noDots && noDots !== title) {
    const r3 = await searchMovies(noDots);
    const b3 = pickBest(r3, noDots, year);
    if (b3 && titleScore(noDots, b3) >= 0.5) return b3;
  }

  // 4. Last resort: return the best candidate from attempt 1 regardless of score
  //    (lets the user see what TMDB found and decide)
  return pickBest(r1, title, year);
}

// POST /import
// Body: { rows: [{ title, status, rating?, year?, watchedAt? }] }
// Searches TMDB for each title (with optional year hint), inserts, returns results.
// Watched rows without watchedAt backfill first/last watch from release date.
router.post("/import", requireAuth, async (req: any, res): Promise<void> => {
  const { rows: rawRows } = req.body ?? {};
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    res.status(400).json({ error: "Body must be { rows: [...] } with at least one entry" });
    return;
  }
  if (rawRows.length > 500) {
    res.status(400).json({ error: "Max 500 rows per import" });
    return;
  }

  const rows = parseRows(rawRows);
  if (rows.length === 0) {
    res.status(400).json({ error: "No valid rows found (each row needs a title)" });
    return;
  }

  // Load existing tmdbIds for this user to detect duplicates
  const existing = await db
    .select({ tmdbId: moviesTable.tmdbId })
    .from(moviesTable)
    .where(eq(moviesTable.userId, req.userId));
  const existingIds = new Set(existing.map((e) => e.tmdbId).filter(Boolean));

  type RowResult = {
    title: string;
    status: "added" | "updated" | "duplicate" | "not_found" | "error";
    movieTitle?: string;
    tmdbId?: number;
    error?: string;
  };

  // Process rows in parallel batches of 5 to stay within TMDB rate limits
  const BATCH = 5;
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (row): Promise<RowResult> => {
        try {
          const best = await searchWithFallback(row.title, row.year);

          if (!best) return { title: row.title, status: "not_found" };

          if (best.tmdbId && existingIds.has(best.tmdbId)) {
            if (row.rating) {
              await db
                .update(moviesTable)
                .set({ rating: row.rating })
                .where(and(eq(moviesTable.userId, req.userId), eq(moviesTable.tmdbId, best.tmdbId)));
              return { title: row.title, status: "updated", movieTitle: best.title, tmdbId: best.tmdbId };
            }
            return { title: row.title, status: "duplicate", movieTitle: best.title, tmdbId: best.tmdbId };
          }

          // Fetch full details for genres/overview
          let details = best;
          try { details = await getMovieDetails(best.tmdbId); } catch { /* use search fields */ }

          const watchedAt =
            row.status === "watched"
              ? resolveImportWatchedAt({
                  watchedAtRaw: row.watchedAt,
                  releaseDate: details.releaseDate ?? null,
                  releaseYear: details.releaseYear ?? row.year ?? null,
                })
              : null;

          await db.insert(moviesTable).values({
            userId: req.userId,
            title: details.title,
            status: row.status,
            rating: row.rating ?? null,
            tmdbId: details.tmdbId,
            posterPath: details.posterPath ?? null,
            releaseYear: details.releaseYear ?? null,
            releaseDate: details.releaseDate ?? null,
            originalLanguage: details.originalLanguage ?? null,
            genres: details.genres ?? null,
            overview: details.overview ?? null,
            firstWatchedAt: watchedAt,
            watchedAt,
          });

          if (best.tmdbId) existingIds.add(best.tmdbId);
          return { title: row.title, status: "added", movieTitle: details.title, tmdbId: details.tmdbId ?? undefined };
        } catch (err) {
          logger.warn({ err, title: row.title }, "Import row failed");
          return { title: row.title, status: "error", error: String(err) };
        }
      })
    );
    results.push(...batchResults);
  }

  const summary = {
    added: results.filter((r) => r.status === "added").length,
    updated: results.filter((r) => r.status === "updated").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    notFound: results.filter((r) => r.status === "not_found").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  res.json({ summary, results });
});

export default router;
