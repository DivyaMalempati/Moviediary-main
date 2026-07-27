import { useState, useEffect, useCallback, useRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { getPosterUrl } from "@/lib/movie-utils";
import { getGuestHeaders } from "@/lib/demo-auth";
import { toast } from "sonner";
import {
  Loader2,
  X,
  Heart,
  Bookmark,
  ArrowRight,
  Film,
  RefreshCw,
  WifiOff,
  Clock,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Genre chips ────────────────────────────────────────────────────────────────
const GENRES = [
  { label: "Any",       id: null },
  { label: "Action",    id: 28 },
  { label: "Drama",     id: 18 },
  { label: "Comedy",    id: 35 },
  { label: "Thriller",  id: 53 },
  { label: "Romance",   id: 10749 },
  { label: "Horror",    id: 27 },
  { label: "Animation", id: 16 },
] as const;

type GenreId = (typeof GENRES)[number]["id"];

// ── Types ──────────────────────────────────────────────────────────────────────
interface SwipeFilm {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  overview: string | null;
  genres: string[] | null;
}

// ── Language → flag ────────────────────────────────────────────────────────────
const LANG_FLAG: Record<string, string> = {
  ml: "🇮🇳", ta: "🇮🇳", te: "🇮🇳", hi: "🇮🇳", kn: "🇮🇳", bn: "🇮🇳",
  ko: "🇰🇷", ja: "🇯🇵", zh: "🇨🇳",
  fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", es: "🇪🇸", pt: "🇵🇹",
  fa: "🇮🇷", ar: "🇸🇦", tr: "🇹🇷", he: "🇮🇱",
  ru: "🇷🇺", da: "🇩🇰", ro: "🇷🇴", el: "🇬🇷", th: "🇹🇭", id: "🇮🇩",
};

// ── LocalStorage seen-today helpers ────────────────────────────────────────────
const todayKey = () => new Date().toISOString().split("T")[0];
const lsSeenKey = () => `cinevault:swipe:seen:${todayKey()}`;

function getSeenToday(): Set<number> {
  try {
    const raw = localStorage.getItem(lsSeenKey()) ?? "";
    return new Set(raw.split(",").filter(Boolean).map(Number));
  } catch { return new Set(); }
}
function markSeenToday(id: number) {
  try {
    const s = getSeenToday(); s.add(id);
    localStorage.setItem(lsSeenKey(), [...s].join(","));
  } catch {}
}

// ── Offline save queue helpers ─────────────────────────────────────────────────
const LS_QUEUE_KEY = "cinevault:swipe:offline-queue";

function getOfflineQueue(): SwipeFilm[] {
  try {
    const raw = localStorage.getItem(LS_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SwipeFilm[]) : [];
  } catch { return []; }
}

function writeOfflineQueue(films: SwipeFilm[]) {
  try {
    if (films.length === 0) localStorage.removeItem(LS_QUEUE_KEY);
    else localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(films));
  } catch {}
}

function enqueueOffline(film: SwipeFilm) {
  const q = getOfflineQueue();
  if (!q.find((f) => f.tmdbId === film.tmdbId)) {
    writeOfflineQueue([...q, film]);
  }
}

function dequeueOffline(tmdbId: number) {
  writeOfflineQueue(getOfflineQueue().filter((f) => f.tmdbId !== tmdbId));
}

// ── Online status hook ─────────────────────────────────────────────────────────
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

// ── API helpers ────────────────────────────────────────────────────────────────
async function fetchSwipeBatch(page: number, genreId?: number | null, excludeIds?: Set<number>): Promise<SwipeFilm[]> {
  try {
    const params = new URLSearchParams({ page: String(page) });
    if (genreId != null) params.set("genreId", String(genreId));
    if (excludeIds && excludeIds.size > 0) params.set("excludeIds", [...excludeIds].join(","));
    const res = await fetch(`${BASE}/api/discover/swipe?${params}`, {
      headers: { ...getGuestHeaders() },
      credentials: "include",
    });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function addToWatchlist(film: SwipeFilm): Promise<boolean> {
  try {
    // Zod schema uses .optional() (not .nullable()), so strip null fields —
    // sending null for an optional field triggers a 400 validation error.
    const body: Record<string, unknown> = {
      title: film.title,
      status: "watchlist",
    };
    if (film.tmdbId != null)           body.tmdbId = film.tmdbId;
    if (film.posterPath != null)        body.posterPath = film.posterPath;
    if (film.releaseYear != null)       body.releaseYear = film.releaseYear;
    if (film.originalLanguage != null)  body.originalLanguage = film.originalLanguage;
    if (film.overview != null)          body.overview = film.overview;
    if (film.genres?.length)            body.genres = film.genres;

    const res = await fetch(`${BASE}/api/movies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getGuestHeaders() },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return res.status === 201 || res.status === 409;
  } catch { return false; }
}

// ── Card component ─────────────────────────────────────────────────────────────
interface SwipeCardProps {
  film: SwipeFilm;
  isTop: boolean;
  stackIndex: number;
  onSave: (film: SwipeFilm) => void;
  onSkip: (film: SwipeFilm) => void;
}

const CARD_W = 320; // px — reference width for aspect calc

function SwipeCard({ film, isTop, stackIndex, onSave, onSkip }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-14, 0, 14]);

  // Colour tint on the card as it moves
  const saveOverlayOpacity = useTransform(x, [0, 120], [0, 0.55]);
  const skipOverlayOpacity = useTransform(x, [-120, 0], [0.55, 0]);

  // "SAVE" / "SKIP" label opacity — appear sooner, fully visible earlier
  const saveLabelOpacity = useTransform(x, [20, 80], [0, 1]);
  const skipLabelOpacity = useTransform(x, [-80, -20], [1, 0]);

  const posterUrl = getPosterUrl(film.posterPath, "w500");
  const flag = LANG_FLAG[film.originalLanguage ?? ""] ?? "🎬";

  const handleDragEnd = async (_: unknown, info: PanInfo) => {
    if (info.offset.x > 90) {
      await animate(x, 650, { duration: 0.25 });
      onSave(film);
    } else if (info.offset.x < -90) {
      await animate(x, -650, { duration: 0.25 });
      onSkip(film);
    } else {
      animate(x, 0, { type: "spring", stiffness: 350, damping: 25 });
    }
  };

  const scale = 1 - stackIndex * 0.04;
  const yOffset = stackIndex * 10;

  return (
    <motion.div
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        scale,
        y: yOffset,
        position: "absolute",
        width: "100%",
        zIndex: 10 - stackIndex,
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
      className={cn(
        "rounded-2xl overflow-hidden shadow-2xl shadow-black/60 bg-zinc-900 border border-white/10 select-none",
        isTop && "cursor-grab active:cursor-grabbing"
      )}
    >
      {/* ── Poster fills the whole card ─────────────────────────────────────── */}
      <div className="relative w-full" style={{ height: CARD_W * 1.58 }}>
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={film.title}
            className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
            <Film className="w-16 h-16 text-zinc-600" />
          </div>
        )}

        {/* ── Coloured tint overlay (green = save, red = skip) ─────────────── */}
        {isTop && (
          <>
            <motion.div
              style={{ opacity: saveOverlayOpacity }}
              className="absolute inset-0 bg-emerald-500 pointer-events-none"
            />
            <motion.div
              style={{ opacity: skipOverlayOpacity }}
              className="absolute inset-0 bg-rose-600 pointer-events-none"
            />
          </>
        )}

        {/* ── SAVE / SKIP banners — top corners ────────────────────────────── */}
        {isTop && (
          <>
            {/* SAVE — top right, appears when dragging right */}
            <motion.div
              style={{ opacity: saveLabelOpacity }}
              className="absolute top-5 right-4 z-20 pointer-events-none"
            >
              <div className="px-4 py-2 rounded-xl border-[3px] border-emerald-400 rotate-[-12deg] bg-black/40 backdrop-blur-sm">
                <span className="text-emerald-300 font-black text-xl tracking-widest uppercase">
                  Save
                </span>
              </div>
            </motion.div>

            {/* SKIP — top left, appears when dragging left */}
            <motion.div
              style={{ opacity: skipLabelOpacity }}
              className="absolute top-5 left-4 z-20 pointer-events-none"
            >
              <div className="px-4 py-2 rounded-xl border-[3px] border-rose-400 rotate-[12deg] bg-black/40 backdrop-blur-sm">
                <span className="text-rose-300 font-black text-xl tracking-widest uppercase">
                  Skip
                </span>
              </div>
            </motion.div>
          </>
        )}

        {/* ── Film info — gradient overlay at the bottom of the poster ─────── */}
        <div className="absolute inset-x-0 bottom-0 pt-32 pb-5 px-4 bg-gradient-to-t from-black via-black/90 to-transparent">
          {/* Title + year */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="font-bold text-base leading-snug text-white">{film.title}</h2>
            <span className="text-xs text-white/60 shrink-0 mt-0.5">
              {flag} {film.releaseYear ?? ""}
            </span>
          </div>

          {/* Genres — shown first so they're always visible */}
          {film.genres && film.genres.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-2.5">
              {film.genres.slice(0, 4).map((g) => (
                <span
                  key={g}
                  className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/20 text-white font-medium border border-white/30"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Overview — more lines visible */}
          {film.overview && (
            <p className="text-xs text-white/80 leading-relaxed line-clamp-4">
              {film.overview}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Summary screen ─────────────────────────────────────────────────────────────
function SummaryScreen({
  saved,
  pendingCount,
  onKeepSwiping,
}: {
  saved: SwipeFilm[];
  pendingCount: number;
  onKeepSwiping: () => void;
}) {
  const [, setLocation] = useLocation();
  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-3">🎬</div>
          <h1 className="text-2xl font-bold">Your picks this session</h1>
          <p className="text-muted-foreground text-sm">
            {saved.length} film{saved.length === 1 ? "" : "s"} saved to your watchlist
            {pendingCount > 0 && (
              <span className="ml-1 text-amber-400">
                · {pendingCount} pending sync
              </span>
            )}
          </p>
          {pendingCount > 0 && (
            <p className="text-xs text-amber-400/80 flex items-center justify-center gap-1.5 mt-1">
              <Clock className="w-3 h-3" />
              {pendingCount} film{pendingCount === 1 ? "" : "s"} will sync when you're back online
            </p>
          )}
        </div>

        {saved.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {saved.map((film) => {
              const url = getPosterUrl(film.posterPath, "w500");
              return (
                <div key={film.tmdbId} className="space-y-1">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden bg-secondary border border-border">
                    {url ? (
                      <img
                        src={url}
                        alt={film.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-8 h-8 text-muted-foreground/20" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight truncate">{film.title}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => setLocation("/watchlist")}
            className="flex-1 bg-white text-black hover:bg-white/90 gap-2"
          >
            <Bookmark className="w-4 h-4" /> View watchlist
          </Button>
          <Button variant="outline" onClick={onKeepSwiping} className="flex-1 gap-2">
            <RefreshCw className="w-4 h-4" /> Keep swiping
          </Button>
        </div>
      </div>
    </Layout>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SwipePage() {
  const qc = useQueryClient();
  const isOnline = useOnlineStatus();

  const [selectedGenreId, setSelectedGenreId] = useState<GenreId>(null);
  const [queue, setQueue] = useState<SwipeFilm[]>([]);
  // Only films confirmed saved to the server (accurate summary)
  const [savedFilms, setSavedFilms] = useState<SwipeFilm[]>([]);
  // Offline queue count for display (reads from localStorage)
  const [pendingCount, setPendingCount] = useState(() => getOfflineQueue().length);
  const [apiPage, setApiPage] = useState(2);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const seenRef = useRef<Set<number>>(getSeenToday());

  const loadBatch = useCallback(async (p: number, genreId: GenreId) => {
    const films = await fetchSwipeBatch(p, genreId, seenRef.current);
    return films.filter((f) => !seenRef.current.has(f.tmdbId));
  }, []);

  // Initial load + reload when genre changes
  useEffect(() => {
    (async () => {
      setLoading(true);
      setExhausted(false);
      setQueue([]);
      const fresh = await loadBatch(1, selectedGenreId);
      setQueue(fresh);
      setApiPage(2);
      setLoading(false);
      if (fresh.length === 0) setExhausted(true);
    })();
  }, [loadBatch, selectedGenreId]);

  useEffect(() => {
    if (queue.length > 5 || fetchingMore || loading || exhausted || showSummary) return;
    setFetchingMore(true);
    loadBatch(apiPage, selectedGenreId).then((more) => {
      if (more.length === 0) setExhausted(true);
      else setQueue((q) => [...q, ...more]);
      setApiPage((p) => p + 1);
      setFetchingMore(false);
    });
  }, [queue.length, fetchingMore, loading, exhausted, showSummary, apiPage, loadBatch, selectedGenreId]);

  // Retry offline queue when back online
  useEffect(() => {
    if (!isOnline) return;
    const queued = getOfflineQueue();
    if (queued.length === 0) return;

    setIsRetrying(true);
    let synced = 0;

    const retryAll = async () => {
      for (const film of queued) {
        const ok = await addToWatchlist(film);
        if (ok) {
          dequeueOffline(film.tmdbId);
          synced++;
          setPendingCount(getOfflineQueue().length);
        }
      }
      setIsRetrying(false);
      if (synced > 0) {
        qc.invalidateQueries({ queryKey: ["movies"] });
        toast.success(
          `${synced} film${synced === 1 ? "" : "s"} synced to your watchlist`,
          { duration: 4000 }
        );
      }
    };

    retryAll();
  }, [isOnline, qc]);

  const advance = useCallback(() => setQueue((q) => q.slice(1)), []);

  const handleSkip = useCallback((film: SwipeFilm) => {
    markSeenToday(film.tmdbId);
    seenRef.current.add(film.tmdbId);
    advance();
  }, [advance]);

  const handleSave = useCallback(async (film: SwipeFilm) => {
    markSeenToday(film.tmdbId);
    seenRef.current.add(film.tmdbId);
    advance();

    if (!isOnline) {
      // Offline: queue for later, don't count as confirmed save yet
      enqueueOffline(film);
      setPendingCount(getOfflineQueue().length);
      toast.warning(`Saved offline — will sync when you're back online`, {
        duration: 3000,
        icon: <WifiOff className="w-4 h-4" />,
      });
      return;
    }

    const ok = await addToWatchlist(film);
    if (ok) {
      // Confirmed: count in session summary
      setSavedFilms((s) => [...s, film]);
      qc.invalidateQueries({ queryKey: ["movies"] });
    } else {
      // Online but request failed: queue it for retry
      enqueueOffline(film);
      setPendingCount(getOfflineQueue().length);
      toast.error("Save failed — queued for retry when connection improves", {
        duration: 4000,
      });
    }
  }, [advance, isOnline, qc]);

  // Show summary every 10 confirmed saves
  useEffect(() => {
    if (savedFilms.length > 0 && savedFilms.length % 10 === 0) setShowSummary(true);
  }, [savedFilms.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const current = queue[0];
    if (!current || showSummary) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleSave(current);
      if (e.key === "ArrowLeft") handleSkip(current);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue, showSummary, handleSave, handleSkip]);

  if (showSummary) {
    return (
      <SummaryScreen
        saved={savedFilms}
        pendingCount={pendingCount}
        onKeepSwiping={() => { setShowSummary(false); setSavedFilms([]); }}
      />
    );
  }

  const current = queue[0];
  const isQueueEmpty = !loading && (queue.length === 0 || exhausted);
  const sessionCount = savedFilms.length + pendingCount;

  // Card stack height — matches poster height at CARD_W
  const stackH = Math.round(CARD_W * 1.58) + 20; // +20 for stack peek depth

  return (
    <Layout>
      <div className="flex flex-col items-center px-4 pt-4 pb-6 min-h-[calc(100dvh-4rem)]">

        {/* Offline banner */}
        {!isOnline && (
          <div className="w-full max-w-sm mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>You're offline — saves will sync automatically when you reconnect</span>
          </div>
        )}

        {/* Retry indicator */}
        {isOnline && isRetrying && (
          <div className="w-full max-w-sm mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span>Syncing {pendingCount} queued save{pendingCount === 1 ? "" : "s"}…</span>
          </div>
        )}

        {/* Header */}
        <div className="w-full max-w-sm mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Discover</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sessionCount > 0
                ? `${sessionCount} saved this session${pendingCount > 0 ? ` (${pendingCount} pending)` : ""}`
                : "Drag right to save · left to skip"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {fetchingMore && <Loader2 className="w-3 h-3 animate-spin" />}
            {!isOnline && <WifiOff className="w-3 h-3 text-amber-400" />}
            <span>{queue.length} queued</span>
          </div>
        </div>

        {/* Genre filter chips */}
        <div className="w-full max-w-sm mb-4 -mx-1">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none px-0.5">
            {GENRES.map((g) => (
              <button
                key={String(g.id)}
                onClick={() => setSelectedGenreId(g.id as GenreId)}
                className={cn(
                  "shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  selectedGenreId === g.id
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-muted-foreground border-white/20 hover:border-white/40 hover:text-foreground"
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Finding films for you…</p>
          </div>

        ) : isQueueEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 max-w-xs">
            <div className="text-5xl">🎬</div>
            <div>
              <h2 className="text-xl font-bold mb-2">All caught up for today</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {sessionCount > 0
                  ? `You saved ${sessionCount} film${sessionCount === 1 ? "" : "s"} — great taste. Come back tomorrow for more.`
                  : "No new films match your preferences right now. Check back tomorrow."}
              </p>
            </div>
            {sessionCount > 0 && (
              <Button onClick={() => setShowSummary(true)} className="bg-white text-black hover:bg-white/90 gap-2">
                <Bookmark className="w-4 h-4" /> See what you saved
              </Button>
            )}
          </div>

        ) : (
          <>
            {/* Card stack — height matches card content exactly */}
            <div
              className="relative w-full max-w-[340px]"
              style={{ height: stackH }}
            >
              {queue.slice(0, 3).map((film, i) => (
                <SwipeCard
                  key={film.tmdbId}
                  film={film}
                  isTop={i === 0}
                  stackIndex={i}
                  onSave={handleSave}
                  onSkip={handleSkip}
                />
              ))}
            </div>

            {/* Action buttons — always visible below the stack */}
            <div className="flex items-center gap-10 mt-5">
              {/* Skip */}
              <button
                onClick={() => current && handleSkip(current)}
                aria-label="Skip"
                className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-rose-500/40 text-rose-400 hover:border-rose-500 hover:bg-rose-500/10 transition-all active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Save — amber tint when offline */}
              <button
                onClick={() => current && handleSave(current)}
                aria-label="Save to watchlist"
                className={cn(
                  "w-16 h-16 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 shadow-lg",
                  isOnline
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500 hover:bg-emerald-500/15 shadow-emerald-500/10"
                    : "border-amber-500/50 bg-amber-500/10 text-amber-400 hover:border-amber-500 hover:bg-amber-500/20 shadow-amber-500/10"
                )}
              >
                {isOnline ? <Heart className="w-7 h-7" /> : <WifiOff className="w-6 h-6" />}
              </button>
            </div>

            {/* Keyboard hint + offline hint + view saved */}
            <div className="mt-3 flex flex-col items-center gap-2">
              <p className="hidden sm:block text-[11px] text-muted-foreground">
                ← Skip · → Save to watchlist
              </p>
              {!isOnline && (
                <p className="text-[11px] text-amber-400/70 text-center">
                  Saves will queue and sync when back online
                </p>
              )}
              {sessionCount >= 3 && (
                <button
                  onClick={() => setShowSummary(true)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors flex items-center gap-1"
                >
                  View {sessionCount} saved{pendingCount > 0 ? ` (${pendingCount} pending)` : ""} <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
