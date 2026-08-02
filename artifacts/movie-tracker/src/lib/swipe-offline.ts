/**
 * Offline swipe save queue + "seen today" helpers for the solo Swipe deck.
 * Extracted from pages/swipe.tsx so the page owns UI, not persistence details.
 */

export type OfflineSwipeFilm = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  releaseDate?: string | null;
  originalLanguage: string | null;
  overview: string | null;
  genres: string[] | null;
  voteAverage?: number | null;
  source?: string;
};

export type OfflineQueueItem = {
  film: OfflineSwipeFilm;
  status: "watchlist" | "watched";
  rating?: string | null;
  /** Actual watch day when status is watched (`YYYY-MM-DD` or null = unknown). */
  watchedAt?: string | null;
};

const LS_QUEUE_KEY = "cinevault:swipe:offline-queue-v2";

const todayKey = () => new Date().toISOString().split("T")[0];
const lsSeenKey = () => `cinevault:swipe:seen:${todayKey()}`;

export function getSeenToday(): Set<number> {
  try {
    const raw = localStorage.getItem(lsSeenKey()) ?? "";
    return new Set(raw.split(",").filter(Boolean).map(Number));
  } catch {
    return new Set();
  }
}

export function markSeenToday(id: number) {
  try {
    const s = getSeenToday();
    s.add(id);
    localStorage.setItem(lsSeenKey(), [...s].join(","));
  } catch {
    /* ignore */
  }
}

export function unmarkSeenToday(id: number) {
  try {
    const s = getSeenToday();
    s.delete(id);
    localStorage.setItem(lsSeenKey(), [...s].join(","));
  } catch {
    /* ignore */
  }
}

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(LS_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(items: OfflineQueueItem[]) {
  try {
    if (items.length === 0) localStorage.removeItem(LS_QUEUE_KEY);
    else localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function enqueueOffline(
  film: OfflineSwipeFilm,
  status: "watchlist" | "watched",
  rating?: string | null,
  watchedAt?: string | null,
) {
  const q = getOfflineQueue();
  if (!q.find((i) => i.film.tmdbId === film.tmdbId)) {
    writeOfflineQueue([...q, { film, status, rating, watchedAt }]);
  }
}

export function dequeueOffline(tmdbId: number) {
  writeOfflineQueue(getOfflineQueue().filter((i) => i.film.tmdbId !== tmdbId));
}
