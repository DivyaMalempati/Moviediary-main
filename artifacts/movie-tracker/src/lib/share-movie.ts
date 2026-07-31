import { RATING_LABELS, getPosterUrl } from "@/lib/movie-utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type ShareMovieInput = {
  title: string;
  rating?: string | null;
  notes?: string | null;
  /** Total times seen including first watch (1 + rewatchCount). */
  timesSeen?: number | null;
  /** When true, post is framed as a rewatch. */
  isRewatch?: boolean;
  releaseYear?: number | null;
  /** TMDB poster path (`/abc.jpg`) for the visual share card. */
  posterPath?: string | null;
};

/** Build plain-text caption to accompany the poster card. */
export function buildMovieShareText(input: ShareMovieInput): string {
  const year = input.releaseYear ? ` (${input.releaseYear})` : "";
  const ratingLabel =
    input.rating && RATING_LABELS[input.rating]
      ? RATING_LABELS[input.rating]
      : null;

  const headline = input.isRewatch
    ? `Rewatched ${input.title}${year}`
    : `Watched ${input.title}${year}`;

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

function loadImageFromUrl(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("poster load failed"));
    img.src = url;
  });
}

/**
 * Load a poster for canvas drawing. Prefer the same-origin API proxy so
 * Safari/Replit don't CORS-taint the canvas (which forced the black placeholder).
 */
async function loadPosterForCanvas(
  posterPath: string,
): Promise<{ img: CanvasImageSource; revoke?: () => void }> {
  const path = posterPath.startsWith("/") ? posterPath : `/${posterPath}`;
  const proxyUrl = `${BASE}/api/tmdb/poster-image?path=${encodeURIComponent(path)}&size=w780`;

  try {
    const res = await fetch(proxyUrl, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const blob = await res.blob();
    // Some proxies omit Content-Type; still try to decode as an image.
    if (blob.type && !blob.type.startsWith("image/")) throw new Error("not an image");

    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);
      return {
        img: bitmap,
        revoke: () => {
          try {
            bitmap.close();
          } catch {
            /* ignore */
          }
        },
      };
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImageFromUrl(objectUrl, false);
      return { img, revoke: () => URL.revokeObjectURL(objectUrl) };
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      throw err;
    }
  } catch {
    // Last resort: direct TMDB (may fail CORS on some hosts)
    const direct = getPosterUrl(path, "w780");
    if (!direct) throw new Error("no poster url");
    const img = await loadImageFromUrl(direct, true);
    return { img };
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  let cy = y;

  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = words[i];
      cy += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) {
        // Last line — ellipsis if leftover
        let rest = words.slice(i).join(" ");
        while (ctx.measureText(`${rest}…`).width > maxWidth && rest.length > 1) {
          rest = rest.slice(0, -1);
        }
        ctx.fillText(`${rest}…`, x, cy);
        return cy + lineHeight;
      }
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

/**
 * Render a portrait “social post” card: poster + title + rating + review.
 * Returns a PNG blob suitable for WhatsApp / Instagram / Files.
 */
export async function renderMovieShareCard(input: ShareMovieInput): Promise<Blob | null> {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#141414");
  bg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft vignette
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, W, 180);

  const pad = 72;
  let y = 64;

  // Brand
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 28px Outfit, system-ui, sans-serif";
  ctx.fillText("CINEVAULT", pad, y);
  y += 48;

  // Poster
  const posterW = 560;
  const posterH = 840;
  const posterX = (W - posterW) / 2;
  const posterY = y;

  ctx.fillStyle = "#1a1a1a";
  roundRect(ctx, posterX - 8, posterY - 8, posterW + 16, posterH + 16, 28);
  ctx.fill();

  if (input.posterPath) {
    let revoke: (() => void) | undefined;
    try {
      const loaded = await loadPosterForCanvas(input.posterPath);
      revoke = loaded.revoke;
      const { img } = loaded;
      const iw =
        "naturalWidth" in img && (img as HTMLImageElement).naturalWidth
          ? (img as HTMLImageElement).naturalWidth
          : (img as ImageBitmap).width;
      const ih =
        "naturalHeight" in img && (img as HTMLImageElement).naturalHeight
          ? (img as HTMLImageElement).naturalHeight
          : (img as ImageBitmap).height;
      ctx.save();
      roundRect(ctx, posterX, posterY, posterW, posterH, 20);
      ctx.clip();
      const scale = Math.max(posterW / iw, posterH / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, posterX + (posterW - dw) / 2, posterY + (posterH - dh) / 2, dw, dh);
      ctx.restore();
    } catch {
      drawPosterPlaceholder(ctx, posterX, posterY, posterW, posterH, input.title);
    } finally {
      revoke?.();
    }
  } else {
    drawPosterPlaceholder(ctx, posterX, posterY, posterW, posterH, input.title);
  }

  y = posterY + posterH + 56;

  // Title
  const year = input.releaseYear ? ` (${input.releaseYear})` : "";
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "700 52px Outfit, system-ui, sans-serif";
  y = wrapText(ctx, `${input.title}${year}`, pad, y, W - pad * 2, 60, 2) + 8;

  // Meta line
  const ratingLabel =
    input.rating && RATING_LABELS[input.rating] ? RATING_LABELS[input.rating] : null;
  const bits: string[] = [];
  bits.push(input.isRewatch ? "Rewatch" : "Watched");
  if (input.isRewatch && input.timesSeen && input.timesSeen > 1) bits.push(`×${input.timesSeen}`);
  if (ratingLabel) bits.push(ratingLabel);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "500 32px Outfit, system-ui, sans-serif";
  ctx.fillText(bits.join("  ·  "), pad, y);
  y += 48;

  // Review
  const review = input.notes?.trim();
  if (review) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "italic 34px Georgia, 'Times New Roman', serif";
    wrapText(ctx, `“${review}”`, pad, y, W - pad * 2, 44, 4);
  }

  // Footer
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "500 26px Outfit, system-ui, sans-serif";
  ctx.fillText("Logged on Cinevault", pad, H - 56);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPosterPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
) {
  ctx.fillStyle = "#222";
  roundRect(ctx, x, y, w, h, 20);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 36px Outfit, system-ui, sans-serif";
  ctx.textAlign = "center";
  wrapText(ctx, title, x + w / 2, y + h / 2, w - 80, 44, 3);
  ctx.textAlign = "left";
}

export async function nativeShareMovie(
  text: string,
  title: string,
  image?: Blob | null,
): Promise<"shared" | "cancelled" | "unsupported"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }
  try {
    const files: File[] = [];
    if (image) {
      const file = new File([image], `${slugify(title)}-cinevault.png`, {
        type: "image/png",
      });
      if (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        files.push(file);
      }
    }
    if (files.length) {
      await navigator.share({ title, text, files });
    } else {
      await navigator.share({ title, text });
    }
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}

export function downloadShareCard(blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(title)}-cinevault.png`;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "movie"
  );
}
