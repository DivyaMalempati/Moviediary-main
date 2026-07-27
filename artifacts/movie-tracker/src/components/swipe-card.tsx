import { useRef, forwardRef, useImperativeHandle } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimationControls,
  type PanInfo,
} from "framer-motion";
import { Film } from "lucide-react";
import { getPosterUrl } from "@/lib/movie-utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SwipeFilm {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  overview: string | null;
}

export interface SwipeCardHandle {
  commit: (dir: "save" | "skip") => Promise<void>;
}

// ── Language → flag emoji ──────────────────────────────────────────────────

const LANG_FLAG: Record<string, string> = {
  hi: "🇮🇳", te: "🇮🇳", ta: "🇮🇳", ml: "🇮🇳", kn: "🇮🇳", mr: "🇮🇳",
  bn: "🇧🇩", pa: "🇮🇳", gu: "🇮🇳", or: "🇮🇳", as: "🇮🇳",
  en: "🇺🇸", ko: "🇰🇷", ja: "🇯🇵", zh: "🇨🇳",
  fr: "🇫🇷", de: "🇩🇪", es: "🇪🇸", it: "🇮🇹", pt: "🇵🇹",
  ru: "🇷🇺", ar: "🇸🇦", tr: "🇹🇷", th: "🇹🇭", vi: "🇻🇳",
  fa: "🇮🇷", ur: "🇵🇰",
};

function getFlag(lang: string | null | undefined) {
  if (!lang) return "🌍";
  return LANG_FLAG[lang] ?? "🌍";
}

function truncateOverview(text: string | null | undefined, maxLen = 160): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  const trimmed = text.slice(0, maxLen);
  const lastSpace = trimmed.lastIndexOf(" ");
  return (lastSpace > 100 ? trimmed.slice(0, lastSpace) : trimmed) + "…";
}

// ── Card skeleton ──────────────────────────────────────────────────────────

export function SwipeCardSkeleton() {
  return (
    <div className="w-full max-w-sm mx-auto rounded-3xl overflow-hidden border border-border/40 bg-card shadow-2xl animate-pulse">
      <div className="aspect-[2/3] bg-secondary/60" />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-secondary/60 rounded w-3/4" />
        <div className="h-3.5 bg-secondary/40 rounded w-1/4" />
        <div className="space-y-1.5 pt-1">
          <div className="h-3 bg-secondary/40 rounded" />
          <div className="h-3 bg-secondary/40 rounded w-5/6" />
          <div className="h-3 bg-secondary/40 rounded w-4/6" />
        </div>
      </div>
    </div>
  );
}

// ── Swipe threshold ────────────────────────────────────────────────────────

const THRESHOLD = 100;

// ── SwipeCard ─────────────────────────────────────────────────────────────

export interface SwipeCardProps {
  film: SwipeFilm;
  onSave: () => void;
  onSkip: () => void;
  onExited: () => void;
  isNext?: boolean;
}

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(
  function SwipeCard({ film, onSave, onSkip, onExited, isNext = false }, ref) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-250, 250], [-18, 18]);
    const cardOpacity = useTransform(x, [-300, -200, 0, 200, 300], [0, 1, 1, 1, 0]);
    const saveOpacity = useTransform(x, [30, THRESHOLD], [0, 1]);
    const skipOpacity = useTransform(x, [-30, -THRESHOLD], [0, 1]);

    const controls = useAnimationControls();
    const committedRef = useRef(false);

    const posterUrl = getPosterUrl(film.posterPath, "w500");
    const overview = truncateOverview(film.overview);

    async function commit(direction: "save" | "skip") {
      if (committedRef.current) return;
      committedRef.current = true;
      const targetX = direction === "save" ? 600 : -600;
      const targetRotate = direction === "save" ? 25 : -25;
      await controls.start({
        x: targetX,
        rotate: targetRotate,
        opacity: 0,
        transition: { duration: 0.32, ease: "easeOut" },
      });
      if (direction === "save") onSave(); else onSkip();
      onExited();
    }

    // Expose commit to parent via ref
    useImperativeHandle(ref, () => ({ commit }), []); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleDragEnd(_: PointerEvent, info: PanInfo) {
      if (committedRef.current) return;
      const offset = info.offset.x;
      if (offset > THRESHOLD) {
        await commit("save");
      } else if (offset < -THRESHOLD) {
        await commit("skip");
      } else {
        controls.start({
          x: 0,
          rotate: 0,
          opacity: 1,
          transition: { type: "spring", stiffness: 350, damping: 25 },
        });
      }
    }

    return (
      <motion.div
        drag={isNext ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        animate={controls}
        style={{ x, rotate, opacity: isNext ? undefined : cardOpacity }}
        onDragEnd={handleDragEnd as any}
        className="w-full max-w-sm mx-auto rounded-3xl overflow-hidden border border-border/40 bg-card shadow-2xl cursor-grab active:cursor-grabbing select-none"
      >
        {/* Poster */}
        <div className="relative aspect-[2/3] bg-secondary/50">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={film.title}
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Film className="w-12 h-12 opacity-30" />
              <span className="text-sm opacity-50">{film.title}</span>
            </div>
          )}

          {/* SAVE overlay */}
          <motion.div
            style={{ opacity: saveOpacity }}
            className="absolute top-8 left-6 bg-emerald-500 text-white font-black text-2xl tracking-wider px-4 py-1.5 rounded-xl rotate-[-20deg] border-4 border-emerald-300 shadow-lg pointer-events-none"
          >
            SAVE
          </motion.div>

          {/* SKIP overlay */}
          <motion.div
            style={{ opacity: skipOpacity }}
            className="absolute top-8 right-6 bg-rose-500 text-white font-black text-2xl tracking-wider px-4 py-1.5 rounded-xl rotate-[20deg] border-4 border-rose-300 shadow-lg pointer-events-none"
          >
            SKIP
          </motion.div>
        </div>

        {/* Info */}
        <div className="p-5 space-y-2">
          <h2 className="text-lg font-bold leading-tight line-clamp-2">{film.title}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{getFlag(film.originalLanguage)}</span>
            {film.releaseYear && <span className="font-mono">{film.releaseYear}</span>}
          </div>
          {overview && (
            <p className="text-sm text-muted-foreground leading-relaxed">{overview}</p>
          )}
        </div>
      </motion.div>
    );
  }
);
