import { getPosterUrl } from "@/lib/movie-utils";

export type LookingForwardFilm = {
  id: number;
  title: string;
  posterPath?: string | null;
  releaseDate: string;
  daysUntil: number;
  originalLanguage?: string | null;
};

function parseYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysUntilRelease(releaseDate: string, today = new Date()): number | null {
  const release = parseYmd(releaseDate);
  if (!release) return null;
  const ms = startOfLocalDay(release).getTime() - startOfLocalDay(today).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Prefer out-today, then just-released, then upcoming soon. */
function compareReminderPriority(a: LookingForwardFilm, b: LookingForwardFilm) {
  const tier = (d: number) => (d === 0 ? 0 : d < 0 ? 1 : 2);
  const ta = tier(a.daysUntil);
  const tb = tier(b.daysUntil);
  if (ta !== tb) return ta - tb;
  const da = Math.abs(a.daysUntil);
  const db = Math.abs(b.daysUntil);
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title);
}

/** Watchlist titles with a known release day still ahead (or just out). */
export function findLookingForward(
  movies: Array<{
    id: number;
    title: string;
    status?: string;
    posterPath?: string | null;
    releaseDate?: string | null;
    originalLanguage?: string | null;
  }>,
  opts?: { today?: Date; includePastDays?: number },
): LookingForwardFilm[] {
  const today = opts?.today ?? new Date();
  const includePastDays = opts?.includePastDays ?? 14;

  return movies
    .flatMap((m) => {
      if (m.status && m.status !== "watchlist") return [];
      if (!m.releaseDate) return [];
      const days = daysUntilRelease(m.releaseDate, today);
      if (days == null) return [];
      if (days < -includePastDays) return [];
      return [
        {
          id: m.id,
          title: m.title,
          posterPath: m.posterPath,
          releaseDate: m.releaseDate,
          daysUntil: days,
          originalLanguage: m.originalLanguage,
        },
      ];
    })
    .sort(compareReminderPriority);
}

/**
 * Titles releasing soon OR just released (default: next 7 days + past 14).
 * Previously only future dates were included — so “out today / just out”
 * never surfaced after release day.
 */
export function findReleaseReminders(
  movies: Array<{
    id: number;
    title: string;
    status?: string;
    posterPath?: string | null;
    releaseDate?: string | null;
    originalLanguage?: string | null;
  }>,
  opts?: { today?: Date; withinDays?: number; includePastDays?: number },
): LookingForwardFilm[] {
  const withinDays = opts?.withinDays ?? 7;
  const includePastDays = opts?.includePastDays ?? 14;
  return findLookingForward(movies, {
    today: opts?.today,
    includePastDays,
  }).filter((f) => f.daysUntil <= withinDays && f.daysUntil >= -includePastDays);
}

export function releaseDismissKey(movieId: number, releaseDate: string) {
  return `cinevault:release-reminder:${movieId}:${releaseDate}`;
}

export function isReleaseDismissed(movieId: number, releaseDate: string) {
  try {
    return localStorage.getItem(releaseDismissKey(movieId, releaseDate)) === "1";
  } catch {
    return false;
  }
}

export function dismissReleaseReminder(movieId: number, releaseDate: string) {
  try {
    localStorage.setItem(releaseDismissKey(movieId, releaseDate), "1");
  } catch {
    /* ignore */
  }
}

export function formatReleaseCopy(film: LookingForwardFilm) {
  if (film.daysUntil === 0) {
    return `${film.title} is out today.`;
  }
  if (film.daysUntil === 1) {
    return `${film.title} releases tomorrow.`;
  }
  if (film.daysUntil < 0) {
    const ago = Math.abs(film.daysUntil);
    return `${film.title} came out ${ago === 1 ? "yesterday" : `${ago} days ago`}.`;
  }
  return `${film.title} releases in ${film.daysUntil} days.`;
}

export function formatReleaseDateLabel(ymd: string) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function releasePosterUrl(film: LookingForwardFilm) {
  return getPosterUrl(film.posterPath, "w500");
}
