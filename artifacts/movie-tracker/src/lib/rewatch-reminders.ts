import { getPosterUrl } from "@/lib/movie-utils";

export type AnniversaryFilm = {
  id: number;
  title: string;
  posterPath?: string | null;
  watchedAt: string;
  yearsAgo: number;
  rating?: string | null;
};

/** Films whose last-watched month/day matches today, at least 1 year ago. */
export function findAnniversaryReminders(
  movies: Array<{
    id: number;
    title: string;
    posterPath?: string | null;
    watchedAt?: string | null;
    rating?: string | null;
  }>,
  today = new Date(),
): AnniversaryFilm[] {
  const month = today.getMonth();
  const day = today.getDate();

  return movies
    .flatMap((m) => {
      if (!m.watchedAt) return [];
      const watched = new Date(m.watchedAt);
      if (Number.isNaN(watched.getTime())) return [];
      if (watched.getMonth() !== month || watched.getDate() !== day) return [];
      const yearsAgo = today.getFullYear() - watched.getFullYear();
      if (yearsAgo < 1) return [];
      return [{
        id: m.id,
        title: m.title,
        posterPath: m.posterPath,
        watchedAt: m.watchedAt,
        yearsAgo,
        rating: m.rating,
      }];
    })
    .sort((a, b) => b.yearsAgo - a.yearsAgo || a.title.localeCompare(b.title));
}

export function anniversaryDismissKey(movieId: number, today = new Date()) {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `cinevault:rewatch-reminder:${movieId}:${y}-${m}-${d}`;
}

export function isAnniversaryDismissed(movieId: number, today = new Date()) {
  try {
    return localStorage.getItem(anniversaryDismissKey(movieId, today)) === "1";
  } catch {
    return false;
  }
}

export function dismissAnniversary(movieId: number, today = new Date()) {
  try {
    localStorage.setItem(anniversaryDismissKey(movieId, today), "1");
  } catch {
    /* ignore */
  }
}

export function formatAnniversaryCopy(film: AnniversaryFilm) {
  const years =
    film.yearsAgo === 1 ? "1 year" : `${film.yearsAgo} years`;
  return `You last watched ${film.title} ${years} ago today. Time for a rewatch?`;
}

export function anniversaryPosterUrl(film: AnniversaryFilm) {
  return getPosterUrl(film.posterPath, "w500");
}
