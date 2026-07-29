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
  CheckCircle2,
  Star,
  RotateCcw,
  Tv,
  Clapperboard,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences";
import { OnboardingPreferences } from "@/components/onboarding-preferences";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TMDB_IMG = "https://image.tmdb.org/t/p";

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
  voteAverage?: number | null;
}

interface FilmFlipDetails {
  voteAverage: number | null;
  director: string | null;
  cast: string[];
  providers: {
    flatrate: Array<{ name: string; logoPath: string | null }>;
    rent: Array<{ name: string; logoPath: string | null }>;
    buy: Array<{ name: string; logoPath: string | null }>;
    link: string | null;
  } | null;
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
// v2 key — stores {film, status} so both "watchlist" and "watched" survive offline
const LS_QUEUE_KEY = "cinevault:swipe:offline-queue-v2";
type QueueItem = { film: SwipeFilm; status: "watchlist" | "watched" };

function getOfflineQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(LS_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch { return []; }
}

function writeOfflineQueue(items: QueueItem[]) {
  try {
    if (items.length === 0) localStorage.removeItem(LS_QUEUE_KEY);
    else localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(items));
  } catch {}
}

function enqueueOffline(film: SwipeFilm, status: "watchlist" | "watched") {
  const q = getOfflineQueue();
  if (!q.find((i) => i.film.tmdbId === film.tmdbId)) {
    writeOfflineQueue([...q, { film, status }]);
  }
}

function dequeueOffline(tmdbId: number) {
  writeOfflineQueue(getOfflineQueue().filter((i) => i.film.tmdbId !== tmdbId));
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

async function saveFilm(film: SwipeFilm, status: "watchlist" | "watched"): Promise<boolean> {
  try {
    // Zod schema uses .optional() (not .nullable()), so strip null fields —
    // sending null for an optional field triggers a 400 validation error.
    const body: Record<string, unknown> = {
      title: film.title,
      status,
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

async function fetchFilmFlipDetails(tmdbId: number): Promise<FilmFlipDetails> {
  const headers = { ...getGuestHeaders() };
  const [detailsRes, providersRes] = await Promise.all([
    fetch(`${BASE}/api/tmdb/movie/${tmdbId}`, { headers, credentials: "include" }),
    fetch(`${BASE}/api/tmdb/watch-providers/${tmdbId}`, { headers, credentials: "include" }),
  ]);

  const details = detailsRes.ok
    ? ((await detailsRes.json()) as {
        voteAverage?: number | null;
        director?: string | null;
        cast?: string[];
      })
    : null;

  const providers = providersRes.ok
    ? ((await providersRes.json()) as {
        flatrate?: Array<{ name: string; logoPath: string | null }> | null;
        rent?: Array<{ name: string; logoPath: string | null }> | null;
        buy?: Array<{ name: string; logoPath: string | null }> | null;
        link?: string | null;
      })
    : null;

  return {
    voteAverage: details?.voteAverage ?? null,
    director: details?.director ?? null,
    cast: details?.cast ?? [],
    providers: providers
      ? {
          flatrate: providers.flatrate ?? [],
          rent: providers.rent ?? [],
          buy: providers.buy ?? [],
          link: providers.link ?? null,
        }
      : null,
  };
}

function ProviderRow({
  label,
  providers,
}: {
  label: string;
  providers: Array<{ name: string; logoPath: string | null }>;
}) {
  if (providers.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {providers.slice(0, 4).map((p) => (
          <div
            key={`${label}-${p.name}`}
            className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-lg px-2 py-1"
          >
            {p.logoPath && (
              <img
                src={`${TMDB_IMG}/original${p.logoPath}`}
                alt=""
                className="w-4 h-4 rounded object-cover"
              />
            )}
            <span className="text-[11px] text-white/90 font-medium">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Card component ─────────────────────────────────────────────────────────────
interface SwipeCardProps {
  film: SwipeFilm;
  isTop: boolean;
  stackIndex: number;
  onSave: (film: SwipeFilm) => void;
  onSkip: (film: SwipeFilm) => void;
  onWatched: (film: SwipeFilm) => void;
}

const CARD_W = 320; // px — reference width for aspect calc
const CARD_H = CARD_W * 1.58;

function SwipeCard({ film, isTop, stackIndex, onSave, onSkip, onWatched }: SwipeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-14, 0, 14]);

  // Horizontal tints (green = save, red = skip)
  const saveOverlayOpacity  = useTransform(x, [0, 120],   [0, 0.55]);
  const skipOverlayOpacity  = useTransform(x, [-120, 0],  [0.55, 0]);
  // Upward tint (blue = watched)
  const watchOverlayOpacity = useTransform(y, [-120, 0],  [0.55, 0]);

  // Label opacities
  const saveLabelOpacity    = useTransform(x, [20, 80],   [0, 1]);
  const skipLabelOpacity    = useTransform(x, [-80, -20], [1, 0]);
  const watchLabelOpacity   = useTransform(y, [-80, -20], [1, 0]);

  const [flipped, setFlipped] = useState(false);
  const [details, setDetails] = useState<FilmFlipDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);

  const posterUrl = getPosterUrl(film.posterPath, "w500");
  const flag = LANG_FLAG[film.originalLanguage ?? ""] ?? "🎬";

  // Prefetch flip-side data while this card is on top so the turn feels instant.
  useEffect(() => {
    if (!isTop) return;
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError(false);
    fetchFilmFlipDetails(film.tmdbId)
      .then((d) => {
        if (!cancelled) setDetails(d);
      })
      .catch(() => {
        if (!cancelled) setDetailsError(true);
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isTop, film.tmdbId]);

  // New top film should always start face-up.
  useEffect(() => {
    setFlipped(false);
  }, [film.tmdbId]);

  const handleDragEnd = async (_: unknown, info: PanInfo) => {
    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);

    if (absY > absX && info.offset.y < -90) {
      // Dominant upward drag → watched
      await animate(y, -900, { duration: 0.25 });
      onWatched(film);
    } else if (info.offset.x > 90) {
      await animate(x, 650, { duration: 0.25 });
      onSave(film);
    } else if (info.offset.x < -90) {
      await animate(x, -650, { duration: 0.25 });
      onSkip(film);
    } else {
      animate(x, 0, { type: "spring", stiffness: 350, damping: 25 });
      animate(y, 0, { type: "spring", stiffness: 350, damping: 25 });
    }
  };

  const scale = 1 - stackIndex * 0.04;
  const yOffset = stackIndex * 10;

  const rating =
    details?.voteAverage ??
    (typeof film.voteAverage === "number" ? film.voteAverage : null);
  const streamProviders = details?.providers?.flatrate ?? [];
  const rentProviders = details?.providers?.rent ?? [];
  const buyProviders = details?.providers?.buy ?? [];
  const hasAnyProvider =
    streamProviders.length > 0 || rentProviders.length > 0 || buyProviders.length > 0;

  return (
    <motion.div
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : yOffset,
        rotate: isTop ? rotate : 0,
        scale,
        position: "absolute",
        width: "100%",
        zIndex: 10 - stackIndex,
        perspective: 1400,
      }}
      drag={isTop ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
      onTap={() => {
        if (!isTop) return;
        setFlipped((f) => !f);
      }}
      className={cn(
        "rounded-2xl shadow-2xl shadow-black/60 select-none",
        isTop && "cursor-grab active:cursor-grabbing"
      )}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        style={{
          transformStyle: "preserve-3d",
          height: CARD_H,
          position: "relative",
        }}
      >
        {/* ── Front: poster ─────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
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

          {/* ── Coloured tint overlays ────────────────────────────────────────── */}
          {isTop && (
            <>
              <motion.div style={{ opacity: saveOverlayOpacity }}  className="absolute inset-0 bg-emerald-500 pointer-events-none" />
              <motion.div style={{ opacity: skipOverlayOpacity }}  className="absolute inset-0 bg-rose-600   pointer-events-none" />
              <motion.div style={{ opacity: watchOverlayOpacity }} className="absolute inset-0 bg-blue-500   pointer-events-none" />
            </>
          )}

          {/* ── Action banners ────────────────────────────────────────────────── */}
          {isTop && (
            <>
              <motion.div style={{ opacity: saveLabelOpacity }} className="absolute top-5 right-4 z-20 pointer-events-none">
                <div className="px-4 py-2 rounded-xl border-[3px] border-emerald-400 rotate-[-12deg] bg-black/40 backdrop-blur-sm">
                  <span className="text-emerald-300 font-black text-xl tracking-widest uppercase">Save</span>
                </div>
              </motion.div>

              <motion.div style={{ opacity: skipLabelOpacity }} className="absolute top-5 left-4 z-20 pointer-events-none">
                <div className="px-4 py-2 rounded-xl border-[3px] border-rose-400 rotate-[12deg] bg-black/40 backdrop-blur-sm">
                  <span className="text-rose-300 font-black text-xl tracking-widest uppercase">Skip</span>
                </div>
              </motion.div>

              <motion.div style={{ opacity: watchLabelOpacity }} className="absolute top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div className="px-4 py-2 rounded-xl border-[3px] border-blue-400 bg-black/40 backdrop-blur-sm">
                  <span className="text-blue-300 font-black text-xl tracking-widest uppercase">Watched</span>
                </div>
              </motion.div>
            </>
          )}

          {/* ── Film info — gradient overlay at the bottom of the poster ─────── */}
          <div className="absolute inset-x-0 bottom-0 pt-32 pb-5 px-4 bg-gradient-to-t from-black via-black/90 to-transparent">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 className="font-bold text-base leading-snug text-white">{film.title}</h2>
              <span className="text-xs text-white/60 shrink-0 mt-0.5">
                {flag} {film.releaseYear ?? ""}
              </span>
            </div>

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

            {film.overview && (
              <p className="text-xs text-white/80 leading-relaxed line-clamp-4">
                {film.overview}
              </p>
            )}

            {isTop && (
              <p className="mt-3 text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                <RotateCcw className="w-3 h-3" /> Tap for details
              </p>
            )}
          </div>
        </div>

        {/* ── Back: rating / cast / director / streaming ─────────────────────── */}
        <div
          className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 bg-zinc-950"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {posterUrl && (
            <img
              src={posterUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover object-top opacity-25 scale-110 blur-sm pointer-events-none"
              draggable={false}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/92 to-zinc-950" />

          <div className="relative h-full flex flex-col px-4 pt-5 pb-4 overflow-hidden">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h2 className="font-bold text-base leading-snug text-white line-clamp-2">{film.title}</h2>
                <p className="text-xs text-white/55 mt-1">
                  {flag} {film.releaseYear ?? ""}
                  {film.genres?.length ? ` · ${film.genres.slice(0, 2).join(", ")}` : ""}
                </p>
              </div>
              {rating != null && rating > 0 && (
                <div className="shrink-0 flex items-center gap-1 rounded-xl bg-amber-400/15 border border-amber-300/30 px-2.5 py-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span className="text-sm font-bold text-amber-200 tabular-nums">
                    {rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto pr-0.5">
              {detailsLoading && !details && (
                <div className="flex items-center gap-2 text-white/50 text-sm py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading details…
                </div>
              )}

              {detailsError && !details && (
                <p className="text-sm text-white/50 text-center py-6">Couldn’t load details.</p>
              )}

              {details && (
                <>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45 mb-1.5 flex items-center gap-1.5">
                      <Clapperboard className="w-3 h-3" /> Director
                    </p>
                    <p className="text-sm text-white/90 font-medium">
                      {details.director ?? "Unknown"}
                    </p>
                  </div>

                  {details.cast.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45 mb-1.5 flex items-center gap-1.5">
                        <Users className="w-3 h-3" /> Cast
                      </p>
                      <p className="text-sm text-white/85 leading-relaxed">
                        {details.cast.join(" · ")}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45 mb-2 flex items-center gap-1.5">
                      <Tv className="w-3 h-3" /> Where to watch
                    </p>
                    {!hasAnyProvider ? (
                      <p className="text-xs text-white/45 italic">Not listed for streaming in India.</p>
                    ) : (
                      <div className="space-y-2.5">
                        <ProviderRow label="Stream" providers={streamProviders} />
                        <ProviderRow label="Rent" providers={rentProviders} />
                        <ProviderRow label="Buy" providers={buyProviders} />
                      </div>
                    )}
                    {details.providers?.link && (
                      <a
                        href={details.providers.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block mt-2 text-[11px] text-sky-300 hover:underline"
                      >
                        More options on JustWatch →
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>

            <p className="mt-3 text-[10px] uppercase tracking-widest text-white/35 flex items-center gap-1.5 justify-center">
              <RotateCcw className="w-3 h-3" /> Tap to flip back
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Summary screen ─────────────────────────────────────────────────────────────
function FilmGrid({ films, label }: { films: SwipeFilm[]; label: string }) {
  if (films.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {films.map((film) => {
          const url = getPosterUrl(film.posterPath, "w500");
          return (
            <div key={film.tmdbId} className="space-y-1">
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-secondary border border-border">
                {url ? (
                  <img src={url} alt={film.title} className="w-full h-full object-cover" />
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
    </div>
  );
}

function SummaryScreen({
  saved,
  watched,
  pendingCount,
  onKeepSwiping,
}: {
  saved: SwipeFilm[];
  watched: SwipeFilm[];
  pendingCount: number;
  onKeepSwiping: () => void;
}) {
  const [, setLocation] = useLocation();
  const total = saved.length + watched.length;
  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-3">🎬</div>
          <h1 className="text-2xl font-bold">Your picks this session</h1>
          <p className="text-muted-foreground text-sm">
            {saved.length > 0 && <>{saved.length} saved to watchlist</>}
            {saved.length > 0 && watched.length > 0 && <> · </>}
            {watched.length > 0 && <>{watched.length} logged as watched</>}
            {pendingCount > 0 && <span className="ml-1 text-amber-400">· {pendingCount} pending sync</span>}
          </p>
          {pendingCount > 0 && (
            <p className="text-xs text-amber-400/80 flex items-center justify-center gap-1.5 mt-1">
              <Clock className="w-3 h-3" />
              {pendingCount} film{pendingCount === 1 ? "" : "s"} will sync when you're back online
            </p>
          )}
        </div>

        <FilmGrid films={saved}    label="Saved to watchlist" />
        <FilmGrid films={watched}  label="Logged as watched"  />

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => setLocation("/watchlist")} className="flex-1 bg-white text-black hover:bg-white/90 gap-2">
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

// ── Swipe deck ─────────────────────────────────────────────────────────────────
function SwipeDeck() {
  const qc = useQueryClient();
  const isOnline = useOnlineStatus();

  const [selectedGenreId, setSelectedGenreId] = useState<GenreId>(null);
  const [queue, setQueue] = useState<SwipeFilm[]>([]);
  // Confirmed saves / watches (server-ack'd)
  const [savedFilms, setSavedFilms] = useState<SwipeFilm[]>([]);
  const [watchedFilms, setWatchedFilms] = useState<SwipeFilm[]>([]);
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
      for (const item of queued) {
        const ok = await saveFilm(item.film, item.status);
        if (ok) {
          dequeueOffline(item.film.tmdbId);
          synced++;
          setPendingCount(getOfflineQueue().length);
        }
      }
      setIsRetrying(false);
      if (synced > 0) {
        qc.invalidateQueries({ queryKey: ["movies"] });
        toast.success(`${synced} film${synced === 1 ? "" : "s"} synced`, { duration: 4000 });
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
      enqueueOffline(film, "watchlist");
      setPendingCount(getOfflineQueue().length);
      toast.warning("Saved offline — will sync when you're back online", {
        duration: 3000, icon: <WifiOff className="w-4 h-4" />,
      });
      return;
    }

    const ok = await saveFilm(film, "watchlist");
    if (ok) {
      setSavedFilms((s) => [...s, film]);
      qc.invalidateQueries({ queryKey: ["movies"] });
    } else {
      enqueueOffline(film, "watchlist");
      setPendingCount(getOfflineQueue().length);
      toast.error("Save failed — queued for retry when connection improves", { duration: 4000 });
    }
  }, [advance, isOnline, qc]);

  const handleWatched = useCallback(async (film: SwipeFilm) => {
    markSeenToday(film.tmdbId);
    seenRef.current.add(film.tmdbId);
    advance();

    if (!isOnline) {
      enqueueOffline(film, "watched");
      setPendingCount(getOfflineQueue().length);
      toast.warning("Logged offline — will sync when you're back online", {
        duration: 3000, icon: <WifiOff className="w-4 h-4" />,
      });
      return;
    }

    const ok = await saveFilm(film, "watched");
    if (ok) {
      setWatchedFilms((w) => [...w, film]);
      qc.invalidateQueries({ queryKey: ["movies"] });
    } else {
      enqueueOffline(film, "watched");
      setPendingCount(getOfflineQueue().length);
      toast.error("Log failed — queued for retry when connection improves", { duration: 4000 });
    }
  }, [advance, isOnline, qc]);

  // Show summary every 10 confirmed actions
  const confirmedCount = savedFilms.length + watchedFilms.length;
  useEffect(() => {
    if (confirmedCount > 0 && confirmedCount % 10 === 0) setShowSummary(true);
  }, [confirmedCount]);

  // Keyboard shortcuts
  useEffect(() => {
    const current = queue[0];
    if (!current || showSummary) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleSave(current);
      if (e.key === "ArrowLeft")  handleSkip(current);
      if (e.key === "ArrowUp")    handleWatched(current);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue, showSummary, handleSave, handleSkip, handleWatched]);

  if (showSummary) {
    return (
      <SummaryScreen
        saved={savedFilms}
        watched={watchedFilms}
        pendingCount={pendingCount}
        onKeepSwiping={() => { setShowSummary(false); setSavedFilms([]); setWatchedFilms([]); }}
      />
    );
  }

  const current = queue[0];
  const isQueueEmpty = !loading && (queue.length === 0 || exhausted);
  const sessionCount = confirmedCount + pendingCount;

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
                : "Tap for details · drag right to save · left to skip"}
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
                  onWatched={handleWatched}
                />
              ))}
            </div>

            {/* Action buttons — always visible below the stack */}
            <div className="flex items-center gap-6 mt-5">
              {/* Skip */}
              <button
                onClick={() => current && handleSkip(current)}
                aria-label="Skip"
                className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-rose-500/40 text-rose-400 hover:border-rose-500 hover:bg-rose-500/10 transition-all active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Watched — blue */}
              <button
                onClick={() => current && handleWatched(current)}
                aria-label="Mark as watched"
                className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-blue-500/40 text-blue-400 hover:border-blue-500 hover:bg-blue-500/10 transition-all active:scale-90"
              >
                <CheckCircle2 className="w-6 h-6" />
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
                Tap card for details · ← Skip · ↑ Watched · → Save
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

// ── Onboarding gate ──────────────────────────────────────────────────────────
// Swipe is the app's "tell us what you like" surface — asking preferences
// before the user ever sees it means the very first batch is already
// weighted toward their stated taste instead of generic popular/iconic.
export default function SwipePage() {
  const { data: prefs, isLoading } = usePreferences();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!prefs?.onboardingCompletedAt) {
    return <OnboardingPreferences onComplete={() => {}} />;
  }

  return <SwipeDeck />;
}
