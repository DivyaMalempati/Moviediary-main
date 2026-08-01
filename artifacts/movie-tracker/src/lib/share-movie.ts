import { RATING_LABELS, getPosterUrl } from "@/lib/movie-utils";
import { getSyncSessionHeaders } from "@/lib/demo-auth";

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

/** Build plain-text caption to accompany the poster card (WhatsApp / share sheet). */
export function buildMovieShareText(input: ShareMovieInput): string {
  const year = input.releaseYear ? ` (${input.releaseYear})` : "";
  const ratingLabel =
    input.rating && RATING_LABELS[input.rating]
      ? RATING_LABELS[input.rating]
      : null;

  const lines = [
    `I recommend this movie for you to watch: ${input.title}${year}`,
  ];

  const meta: string[] = [];
  if (input.isRewatch) {
    meta.push(
      input.timesSeen && input.timesSeen > 1
        ? `Rewatch ×${input.timesSeen}`
        : "Rewatch",
    );
  }
  if (ratingLabel) meta.push(ratingLabel);
  if (meta.length) lines.push(meta.join(" · "));

  const review = input.notes?.trim();
  if (review) {
    lines.push("");
    lines.push(`“${review}”`);
  }

  lines.push("");
  lines.push("— Shared from Cinevault");
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
    const res = await fetch(proxyUrl, {
      credentials: "same-origin",
      headers: getSyncSessionHeaders(),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const blob = await res.blob();
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

async function ensureShareFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("600 26px Outfit"),
        document.fonts.load("700 48px Outfit"),
        document.fonts.load("500 28px Outfit"),
        document.fonts.ready,
      ]),
      new Promise((r) => setTimeout(r, 800)),
    ]);
  } catch {
    /* system fallbacks */
  }
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  W: number,
  H: number,
) {
  const iw =
    "naturalWidth" in img && (img as HTMLImageElement).naturalWidth
      ? (img as HTMLImageElement).naturalWidth
      : (img as ImageBitmap).width;
  const ih =
    "naturalHeight" in img && (img as HTMLImageElement).naturalHeight
      ? (img as HTMLImageElement).naturalHeight
      : (img as ImageBitmap).height;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/**
 * Full-bleed 4:5 share card: poster fills the frame; title/meta/quote sit in a
 * padded bottom gradient band (no floating inset poster, no empty black void).
 */
export async function renderMovieShareCard(input: ShareMovieInput): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  await ensureShareFonts();

  // Fallback fill if poster missing
  ctx.fillStyle = "#1a1a1c";
  ctx.fillRect(0, 0, W, H);

  let revoke: (() => void) | undefined;
  if (input.posterPath) {
    try {
      const loaded = await loadPosterForCanvas(input.posterPath);
      revoke = loaded.revoke;
      drawCoverImage(ctx, loaded.img, W, H);
    } catch {
      ctx.fillStyle = "#2a2a2e";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "600 40px Outfit, system-ui, sans-serif";
      ctx.textAlign = "center";
      wrapText(ctx, input.title, W / 2, H * 0.35, W - 160, 48, 3);
      ctx.textAlign = "left";
    } finally {
      revoke?.();
    }
  } else {
    ctx.fillStyle = "#2a2a2e";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "600 40px Outfit, system-ui, sans-serif";
    ctx.textAlign = "center";
    wrapText(ctx, input.title, W / 2, H * 0.35, W - 160, 48, 3);
    ctx.textAlign = "left";
  }

  // Soft top vignette for brand readability
  const topFade = ctx.createLinearGradient(0, 0, 0, 160);
  topFade.addColorStop(0, "rgba(0,0,0,0.45)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, W, 160);

  // Bottom gradient band (~38% of height)
  const bandTop = Math.round(H * 0.62);
  const bottomFade = ctx.createLinearGradient(0, bandTop, 0, H);
  bottomFade.addColorStop(0, "rgba(0,0,0,0)");
  bottomFade.addColorStop(0.28, "rgba(0,0,0,0.55)");
  bottomFade.addColorStop(0.55, "rgba(0,0,0,0.82)");
  bottomFade.addColorStop(1, "rgba(0,0,0,0.94)");
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, bandTop, W, H - bandTop);

  // Brand mark
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 26px Outfit, system-ui, sans-serif";
  ctx.fillText("CINEVAULT", 40, 52);

  // Text band padding per plan
  const padX = 56;
  const padTopInBand = 48;
  const padBottom = 40;
  const maxTextWidth = W - padX * 2;

  const year = input.releaseYear ? ` (${input.releaseYear})` : "";
  const title = `${input.title}${year}`;
  const ratingLabel =
    input.rating && RATING_LABELS[input.rating] ? RATING_LABELS[input.rating] : null;
  const bits: string[] = [];
  bits.push(input.isRewatch ? "Rewatch" : "Watched");
  if (input.isRewatch && input.timesSeen && input.timesSeen > 1) bits.push(`×${input.timesSeen}`);
  if (ratingLabel) bits.push(ratingLabel);
  const meta = bits.join("  ·  ");
  const review = input.notes?.trim() ?? "";

  // Measure block height so short content sits higher (still fills the band visually)
  ctx.font = "700 48px Outfit, system-ui, sans-serif";
  const titleLines = measureWrappedLines(ctx, title, maxTextWidth, 2);
  ctx.font = "500 28px Outfit, system-ui, sans-serif";
  const metaH = 28;
  ctx.font = "italic 30px Georgia, 'Times New Roman', serif";
  const reviewLines = review ? measureWrappedLines(ctx, `“${review}”`, maxTextWidth, 3) : 0;
  const reviewH = reviewLines * 38;
  const footerH = 22;

  const titleBlockH = titleLines * 56;
  const gaps =
    16 + // title → meta
    (review ? 20 : 0) + // meta → review
    24; // review/meta → footer
  const contentH = titleBlockH + metaH + reviewH + footerH + gaps;
  const bandInnerH = H - bandTop - padTopInBand - padBottom;
  // Start near top of band; if content is short, keep padTop (filled look via gradient)
  let y = bandTop + padTopInBand + Math.max(0, (bandInnerH - contentH) * 0.15);

  // Title baseline roughly at font size; wrapText uses y as baseline
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "700 48px Outfit, system-ui, sans-serif";
  y = wrapText(ctx, title, padX, y + 48, maxTextWidth, 56, 2);

  y += 16;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "500 28px Outfit, system-ui, sans-serif";
  ctx.fillText(meta, padX, y);
  y += metaH;

  if (review) {
    y += 20;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "italic 30px Georgia, 'Times New Roman', serif";
    y = wrapText(ctx, `“${review}”`, padX, y + 30, maxTextWidth, 38, 3);
  }

  y += 24;
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "500 22px Outfit, system-ui, sans-serif";
  // Keep footer inside bottom pad
  const footerY = Math.min(y + 22, H - padBottom);
  ctx.fillText("Logged on Cinevault", padX, footerY);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
}

function measureWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 1;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines += 1;
      line = words[i];
      if (lines >= maxLines) return maxLines;
    } else {
      line = test;
    }
  }
  return lines;
}

function shareImageFilename(title: string, blob: Blob): string {
  const ext = blob.type.includes("jpeg") || blob.type.includes("jpg") ? "jpg" : "png";
  return `${slugify(title)}-cinevault.${ext}`;
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
    // WhatsApp often surfaces `title` as the message when an image is attached.
    const shareTitle = `I recommend watching ${title}`;
    const files: File[] = [];
    if (image) {
      const file = new File([image], shareImageFilename(title, image), {
        type: image.type || "image/jpeg",
      });
      if (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        files.push(file);
      }
    }
    if (files.length) {
      await navigator.share({ title: shareTitle, text, files });
    } else {
      await navigator.share({ title: shareTitle, text });
    }
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Save the poster image. On iOS Safari `<a download>` is unreliable for blobs,
 * so we fall back to the native share sheet (Save Image) or open the image.
 */
export async function downloadShareCard(
  blob: Blob,
  title: string,
): Promise<"downloaded" | "shared" | "opened"> {
  const filename = shareImageFilename(title, blob);
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

  if (
    isAppleTouchDevice() &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: `I recommend watching ${title}`,
        text: `I recommend this movie for you to watch: ${title}`,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (isAppleTouchDevice()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return "opened";
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "downloaded";
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
