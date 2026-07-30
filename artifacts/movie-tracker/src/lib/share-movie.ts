import { RATING_LABELS } from "@/lib/movie-utils";

export type ShareMovieInput = {
  title: string;
  rating?: string | null;
  notes?: string | null;
  /** Total times seen including first watch (1 + rewatchCount). */
  timesSeen?: number | null;
  /** When true, post is framed as a rewatch. */
  isRewatch?: boolean;
  releaseYear?: number | null;
};

/** Build plain-text post for social / Messages / clipboard. */
export function buildMovieShareText(input: ShareMovieInput): string {
  const year = input.releaseYear ? ` (${input.releaseYear})` : "";
  const ratingLabel =
    input.rating && RATING_LABELS[input.rating]
      ? RATING_LABELS[input.rating]
      : null;

  const headline = input.isRewatch
    ? `🔁 Rewatched ${input.title}${year}`
    : `🎬 Watched ${input.title}${year}`;

  const meta: string[] = [];
  if (input.isRewatch && input.timesSeen && input.timesSeen > 1) {
    meta.push(`×${input.timesSeen}`);
  }
  if (ratingLabel) meta.push(ratingLabel);

  const lines = [meta.length ? `${headline} — ${meta.join(" · ")}` : headline];

  const review = input.notes?.trim();
  if (review) {
    lines.push("");
    lines.push(`“${review}”`);
  }

  lines.push("");
  lines.push("Logged on Cinevault");
  return lines.join("\n");
}

export function twitterShareUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function facebookShareUrl(text: string): string {
  // Facebook sharer needs a URL; quote carries the post body when supported.
  const site =
    typeof window !== "undefined" ? window.location.origin : "https://cinevault.app";
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(site)}&quote=${encodeURIComponent(text)}`;
}

export async function copyShareText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Native OS share sheet when available (mobile / supported desktop). */
export async function nativeShareMovie(text: string, title: string): Promise<"shared" | "cancelled" | "unsupported"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }
  try {
    await navigator.share({ title, text });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}
