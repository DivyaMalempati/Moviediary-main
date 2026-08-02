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

/** Today's date as `YYYY-MM-DD` for `<input type="date">`. */
export function todayInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convert a `YYYY-MM-DD` (or ISO) value to a date-only string for APIs. */
export function toWatchDateInput(iso: string | null | undefined): string {
  if (!iso) return todayInputValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayInputValue();
  return todayInputValue(d);
}
