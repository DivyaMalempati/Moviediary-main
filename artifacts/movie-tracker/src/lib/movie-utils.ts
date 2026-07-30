export const RATING_LABELS: Record<string, string> = {
  loved: "Loved",
  great: "Great",
  very_good: "Very Good",
  good: "Good",
  ok: "Ok",
  avg: "Average",
  meh: "Meh",
};

export const getPosterUrl = (path: string | null | undefined, size: "w500" | "w780" | "original" = "w500") => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

/** Format an ISO watch/rewatch date for display. */
export function formatWatchDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
