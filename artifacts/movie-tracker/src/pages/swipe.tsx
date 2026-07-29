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
import { getPosterUrl, RATING_LABELS } from "@/lib/movie-utils";
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
  Undo2,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences";
import { OnboardingPreferences } from "@/components/onboarding-preferences";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TMDB_IMG = "https://image.tmdb.org/t/p";

// Hybrid batch model — stop the infinite swipe void.
const DECK_SIZE = 12;
// Soft cap for "this week" watchlist picks from swipe (choice paralysis guard).
const WEEKLY_WATCHLIST_SOFT_CAP = 5;

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

interface Provider {
  name: string;
  logoPath: string | null;
}

interface FilmFlipDetails {
  voteAverage: number | null;
  runtimeMinutes: number | null;
  director: string | null;
  cast: string[];
  providers: {
    flatrate: Provider[];
    rent: Provider[];
    buy: Provider[];
    link: string | null;
  } | null;
}

type UndoAction = "skip" | "watchlist" | "watched";
interface UndoItem {
  film: SwipeFilm;
  action: UndoAction;
  movieId?: number | null;
}

// ── Language → flag ────────────────────────────────────────────────────────────
const LANG_FLAG: Record<string, string> = {
  ml: "🇮🇳", ta: "🇮🇳", te: "🇮🇳", hi: "🇮🇳", kn: "🇮🇳", bn: "🇮🇳",
  ko: "🇰🇷", ja: "🇯🇵", zh: "🇨🇳",
  fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", es: "🇪🇸", pt: "🇵🇹",
  fa: "🇮🇷", ar: "🇸🇦", tr: "🇹🇷", he: "🇮🇱",
  ru: "🇷🇺", da: "🇩🇰", ro: "🇷🇴", el: "🇬🇷", th: "🇹🇭", id: "🇮🇩",
};

function formatRuntime(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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
function unmarkSeenToday(id: number) {
  try {
    const s = getSeenToday(); s.delete(id);
    localStorage.setItem(lsSeenKey(), [...s].join(","));
  } catch {}
}

// ── Offline save queue helpers ─────────────────────────────────────────────────
const LS_QUEUE_KEY = "cinevault:swipe:offline-queue-v2";
type QueueItem = { film: SwipeFilm; status: "watchlist" | "watched"; rating?: string | null };

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

function enqueueOffline(film: SwipeFilm, status: "watchlist" | "watched", rating?: string | null) {
  const q = getOfflineQueue();
  if (!q.find((i) => i.film.tmdbId === film.tmdbId)) {
    writeOfflineQueue([...q, { film, status, rating }]);
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

async function saveFilm(
  film: SwipeFilm,
  status: "watchlist" | "watched",
  rating?: string | null,
): Promise<{ ok: boolean; id?: number }> {
  try {
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
    if (rating)                         body.rating = rating;

    const res = await fetch(`${BASE}/api/movies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getGuestHeaders() },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.status === 201) {
      const data = (await res.json()) as { id?: number };
      return { ok: true, id: data.id };
    }
    if (res.status === 409) return { ok: true };
    return { ok: false };
  } catch { return { ok: false }; }
}

async function deleteMovie(id: number): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/movies/${id}`, {
      method: "DELETE",
      headers: { ...getGuestHeaders() },
      credentials: "include",
    });
    return res.ok;
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
        runtimeMinutes?: number | null;
        director?: string | null;
        cast?: string[];
      })
    : null;

  const providers = providersRes.ok
    ? ((await providersRes.json()) as {
        flatrate?: Provider[] | null;
        rent?: Provider[] | null;
        buy?: Provider[] | null;
        link?: string | null;
      })
    : null;

  return {
    voteAverage: details?.voteAverage ?? null,
    runtimeMinutes: details?.runtimeMinutes ?? null,
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

async function fillDeck(
  startPage: number,
  genreId: GenreId,
  excludeIds: Set<number>,
  target = DECK_SIZE,
): Promise<{ films: SwipeFilm[]; nextPage: number }> {
  const collected: SwipeFilm[] = [];
  const seen = new Set(excludeIds);
  let page = startPage;

  for (let attempt = 0; attempt < 4 && collected.length < target; attempt++) {
    const batch = await fetchSwipeBatch(page, genreId, seen);
    page += 1;
    if (batch.length === 0) break;
    for (const f of batch) {
      if (seen.has(f.tmdbId)) continue;
      seen.add(f.tmdbId);
      collected.push(f);
      if (collected.length >= target) break;
    }
  }

  return { films: collected.slice(0, target), nextPage: page };
}

function ProviderRow({
  label,
  providers,
}: {
  label: string;
  providers: Provider[];
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

const CARD_W = 320;
const CARD_H = CARD_W * 1.58;

function SwipeCard({ film, isTop, stackIndex, onSave, onSkip, onWatched }: SwipeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-14, 0, 14]);

  const saveOverlayOpacity  = useTransform(x, [0, 120],   [0, 0.55]);
  const skipOverlayOpacity  = useTransform(x, [-120, 0],  [0.55, 0]);
  const watchOverlayOpacity = useTransform(y, [-120, 0],  [0.55, 0]);

  const saveLabelOpacity    = useTransform(x, [20, 80],   [0, 1]);
  const skipLabelOpacity    = useTransform(x, [-80, -20], [1, 0]);
  const watchLabelOpacity   = useTransform(y, [-80, -20], [1, 0]);

  const [flipped, setFlipped] = useState(false);
  const [details, setDetails] = useState<FilmFlipDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const posterUrl = getPosterUrl(film.posterPath, "w500");
  const flag = LANG_FLAG[film.originalLanguage ?? ""] ?? "🎬";

  // Prefetch details for the top two cards so runtime / streaming badges
  // are ready before the user needs them.
  useEffect(() => {
    if (!isTop && stackIndex > 1) return;
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
  }, [isTop, stackIndex, film.tmdbId]);

  useEffect(() => {
    setFlipped(false);
  }, [film.tmdbId]);

  const handleDragStart = () => {
    didDragRef.current = true;
  };

  const handleDragEnd = async (_: unknown, info: PanInfo) => {
    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);

    if (absY > absX && info.offset.y < -90) {
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
  const runtime = formatRuntime(details?.runtimeMinutes);
  const streamProviders = details?.providers?.flatrate ?? [];
  const rentProviders = details?.providers?.rent ?? [];
  const buyProviders = details?.providers?.buy ?? [];
  const hasAnyProvider =
    streamProviders.length > 0 || rentProviders.length > 0 || buyProviders.length > 0;
  const vibeTags = (film.genres ?? []).slice(0, 2);

  // Drag transforms flatten CSS preserve-3d, so we swap faces with a simple
  // rotate/fade instead of a true backface flip.
  const frontFace = (
    <>
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

      {isTop && (
        <>
          <motion.div style={{ opacity: saveOverlayOpacity }}  className="absolute inset-0 bg-emerald-500 pointer-events-none" />
          <motion.div style={{ opacity: skipOverlayOpacity }}  className="absolute inset-0 bg-rose-600   pointer-events-none" />
          <motion.div style={{ opacity: watchOverlayOpacity }} className="absolute inset-0 bg-blue-500   pointer-events-none" />
        </>
      )}

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

      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-1.5 min-h-8">
        {detailsLoading && streamProviders.length === 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-[10px] text-white/60">
            <Loader2 className="w-3 h-3 animate-spin" /> Where to watch…
          </div>
        )}
        {streamProviders.slice(0, 3).map((p) => (
          <div
            key={p.name}
            title={p.name}
            className="flex items-center gap-1.5 max-w-[7.5rem] h-8 rounded-lg overflow-hidden border border-white/25 bg-black/55 backdrop-blur-sm shadow-lg px-1.5"
          >
            {p.logoPath ? (
              <img
                src={`${TMDB_IMG}/w92${p.logoPath}`}
                alt={p.name}
                className="w-6 h-6 rounded object-cover shrink-0"
              />
            ) : null}
            <span className="text-[10px] text-white font-medium truncate">{p.name}</span>
          </div>
        ))}
        {!detailsLoading && details && streamProviders.length === 0 && (
          <div className="px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-[10px] text-white/55">
            Not on major streamers (IN)
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 pt-28 pb-5 px-4 bg-gradient-to-t from-black via-black/90 to-transparent">
        <h2 className="font-bold text-lg leading-snug text-white mb-1.5">{film.title}</h2>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/75 mb-2.5">
          <span>{flag} {film.releaseYear ?? "—"}</span>
          {detailsLoading && !runtime ? (
            <>
              <span className="text-white/30">·</span>
              <span className="inline-flex items-center gap-1 text-white/45">
                <Clock className="w-3 h-3" />…
              </span>
            </>
          ) : runtime ? (
            <>
              <span className="text-white/30">·</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{runtime}</span>
            </>
          ) : null}
          {rating != null && rating > 0 && (
            <>
              <span className="text-white/30">·</span>
              <span className="inline-flex items-center gap-1 text-amber-200">
                <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                {rating.toFixed(1)}
              </span>
            </>
          )}
        </div>

        {vibeTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {vibeTags.map((g) => (
              <span
                key={g}
                className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/15 text-white font-medium border border-white/25"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {film.overview && (
          <p className="text-xs text-white/75 leading-relaxed line-clamp-2">
            {film.overview}
          </p>
        )}

        {isTop && (
          <p className="mt-3 text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-1.5">
            <RotateCcw className="w-3 h-3" /> Tap for cast, director & streaming
          </p>
        )}
      </div>
    </>
  );

  const backFace = (
    <>
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
              {runtime ? ` · ${runtime}` : ""}
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
    </>
  );

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
      }}
      drag={isTop && !flipped ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.6}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerDown={(e) => {
        if (!isTop) return;
        didDragRef.current = false;
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!isTop || !pointerStartRef.current) return;
        const dx = Math.abs(e.clientX - pointerStartRef.current.x);
        const dy = Math.abs(e.clientY - pointerStartRef.current.y);
        pointerStartRef.current = null;
        if (didDragRef.current || dx > 10 || dy > 10) return;
        setFlipped((f) => !f);
      }}
      className={cn(
        "rounded-2xl shadow-2xl shadow-black/60 select-none overflow-hidden bg-zinc-900 border border-white/10",
        isTop && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="relative w-full" style={{ height: CARD_H }}>
        <motion.div
          key={flipped ? "back" : "front"}
          initial={{ opacity: 0.35, rotateY: flipped ? -70 : 70 }}
          animate={{ opacity: 1, rotateY: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          {flipped ? backFace : frontFace}
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Finish-line / summary ──────────────────────────────────────────────────────
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

function FinishLineScreen({
  saved,
  watched,
  pendingCount,
  deckNumber,
  onAnotherDeck,
  anotherDeckDisabled,
}: {
  saved: SwipeFilm[];
  watched: SwipeFilm[];
  pendingCount: number;
  deckNumber: number;
  onAnotherDeck: () => void;
  anotherDeckDisabled?: boolean;
}) {
  const [, setLocation] = useLocation();
  const weekFull = saved.length >= WEEKLY_WATCHLIST_SOFT_CAP;

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-10 space-y-8">
        <div className="text-center space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Deck {deckNumber} complete
          </p>
          <h1 className="text-2xl font-bold">
            {saved.length > 0
              ? `You added ${saved.length} movie${saved.length === 1 ? "" : "s"} to your Watchlist`
              : watched.length > 0
                ? "Nice logging streak"
                : "Deck finished"}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {saved.length > 0
              ? weekFull
                ? "Your week is full enough — pick one for tonight instead of adding more."
                : "Ready to pick one for tonight, or do you want another deck?"
              : watched.length > 0
                ? "Take a breath — or deal another short deck if you’re still browsing."
                : "Nothing stuck this round. Try another short deck, or come back later."}
          </p>
          {pendingCount > 0 && (
            <p className="text-xs text-amber-400/80 flex items-center justify-center gap-1.5 mt-1">
              <Clock className="w-3 h-3" />
              {pendingCount} film{pendingCount === 1 ? "" : "s"} will sync when you're back online
            </p>
          )}
        </div>

        <FilmGrid films={saved} label="This week’s watchlist picks" />
        <FilmGrid films={watched} label="Logged as watched" />

        <div className="flex flex-col gap-3">
          {saved.length > 0 && (
            <Button
              onClick={() => setLocation("/watchlist")}
              className="w-full bg-white text-black hover:bg-white/90 gap-2"
            >
              <Bookmark className="w-4 h-4" /> Pick one for tonight
            </Button>
          )}
          <Button
            variant={saved.length > 0 ? "outline" : "default"}
            onClick={onAnotherDeck}
            disabled={anotherDeckDisabled}
            className={cn("w-full gap-2", saved.length === 0 && "bg-white text-black hover:bg-white/90")}
          >
            <RefreshCw className="w-4 h-4" />
            {weekFull ? "Week feels full — another deck anyway" : "Deal another deck"}
          </Button>
          {watched.length > 0 && saved.length === 0 && (
            <Button variant="outline" onClick={() => setLocation("/watched")} className="w-full gap-2">
              View watched <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
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
  const [savedFilms, setSavedFilms] = useState<SwipeFilm[]>([]);
  const [watchedFilms, setWatchedFilms] = useState<SwipeFilm[]>([]);
  const [pendingCount, setPendingCount] = useState(() => getOfflineQueue().length);
  const [apiPage, setApiPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFinishLine, setShowFinishLine] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [deckNumber, setDeckNumber] = useState(1);
  const [deckActions, setDeckActions] = useState(0);
  const [deckSize, setDeckSize] = useState(DECK_SIZE);
  const [undoStack, setUndoStack] = useState<UndoItem[]>([]);
  const [ratingFilm, setRatingFilm] = useState<SwipeFilm | null>(null);
  const seenRef = useRef<Set<number>>(getSeenToday());
  const finishingRef = useRef(false);
  const pendingFinishRef = useRef(false);

  const startDeck = useCallback(async (page: number, genreId: GenreId, nextDeckNumber?: number) => {
    setLoading(true);
    setShowFinishLine(false);
    setExhausted(false);
    setQueue([]);
    setDeckActions(0);
    setUndoStack([]);
    finishingRef.current = false;
    pendingFinishRef.current = false;
    setRatingFilm(null);
    if (nextDeckNumber != null) setDeckNumber(nextDeckNumber);

    const { films, nextPage } = await fillDeck(page, genreId, seenRef.current, DECK_SIZE);
    setQueue(films);
    setDeckSize(films.length || DECK_SIZE);
    setApiPage(nextPage);
    setLoading(false);
    if (films.length === 0) setExhausted(true);
  }, []);

  useEffect(() => {
    startDeck(1, selectedGenreId, 1);
  }, [selectedGenreId, startDeck]);

  useEffect(() => {
    if (!isOnline) return;
    const queued = getOfflineQueue();
    if (queued.length === 0) return;

    setIsRetrying(true);
    let synced = 0;

    const retryAll = async () => {
      for (const item of queued) {
        const { ok } = await saveFilm(item.film, item.status, item.rating);
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

  const maybeFinishDeck = useCallback((nextActions: number, nextQueueLen: number) => {
    if (finishingRef.current) return;
    if (nextActions >= deckSize || nextQueueLen <= 0) {
      finishingRef.current = true;
      setShowFinishLine(true);
    }
  }, [deckSize]);

  const advance = useCallback((opts?: { deferFinish?: boolean }) => {
    setQueue((q) => {
      const next = q.slice(1);
      setDeckActions((a) => {
        const nextActions = a + 1;
        const shouldFinish = nextActions >= deckSize || next.length <= 0;
        if (shouldFinish) {
          if (opts?.deferFinish) {
            // Watched flow: wait until RatingPickerDialog resolves before finish-line.
            pendingFinishRef.current = true;
          } else {
            queueMicrotask(() => maybeFinishDeck(nextActions, next.length));
          }
        }
        return nextActions;
      });
      return next;
    });
  }, [deckSize, maybeFinishDeck]);

  const pushUndo = useCallback((item: UndoItem) => {
    setUndoStack((s) => [...s.slice(-9), item]);
  }, []);

  const handleSkip = useCallback((film: SwipeFilm) => {
    markSeenToday(film.tmdbId);
    seenRef.current.add(film.tmdbId);
    pushUndo({ film, action: "skip" });
    advance();
  }, [advance, pushUndo]);

  const handleSave = useCallback(async (film: SwipeFilm) => {
    markSeenToday(film.tmdbId);
    seenRef.current.add(film.tmdbId);
    advance();

    if (!isOnline) {
      enqueueOffline(film, "watchlist");
      setPendingCount(getOfflineQueue().length);
      pushUndo({ film, action: "watchlist" });
      toast.warning("Saved offline — will sync when you're back online", {
        duration: 3000, icon: <WifiOff className="w-4 h-4" />,
      });
      return;
    }

    const { ok, id } = await saveFilm(film, "watchlist");
    if (ok) {
      setSavedFilms((s) => [...s, film]);
      pushUndo({ film, action: "watchlist", movieId: id ?? null });
      qc.invalidateQueries({ queryKey: ["movies"] });
      if (savedFilms.length + 1 === WEEKLY_WATCHLIST_SOFT_CAP) {
        toast.message("Week’s watchlist is filling up", {
          description: "Aim for a few strong picks — not an endless list.",
          duration: 3500,
        });
      }
    } else {
      enqueueOffline(film, "watchlist");
      setPendingCount(getOfflineQueue().length);
      pushUndo({ film, action: "watchlist" });
      toast.error("Save failed — queued for retry when connection improves", { duration: 4000 });
    }
  }, [advance, isOnline, pushUndo, qc, savedFilms.length]);

  const commitWatched = useCallback(async (film: SwipeFilm, rating: string | null) => {
    // MovieInput.rating is optional string; only send when set.
    // Values must match DB enum / RATING_LABELS: loved|great|very_good|good|ok|avg|meh
    const safeRating =
      rating && rating in RATING_LABELS ? rating : null;

    if (!isOnline) {
      enqueueOffline(film, "watched", safeRating);
      setPendingCount(getOfflineQueue().length);
      pushUndo({ film, action: "watched" });
      toast.warning("Logged offline — will sync when you're back online", {
        duration: 3000, icon: <WifiOff className="w-4 h-4" />,
      });
      return;
    }

    const { ok, id } = await saveFilm(film, "watched", safeRating);
    if (ok) {
      setWatchedFilms((w) => [...w, film]);
      pushUndo({ film, action: "watched", movieId: id ?? null });
      qc.invalidateQueries({ queryKey: ["movies"] });
    } else {
      enqueueOffline(film, "watched", safeRating);
      setPendingCount(getOfflineQueue().length);
      pushUndo({ film, action: "watched" });
      toast.error("Log failed — queued for retry when connection improves", { duration: 4000 });
    }
  }, [isOnline, pushUndo, qc]);

  const resolveWatchedRating = useCallback(async (rating: string | null) => {
    const film = ratingFilm;
    setRatingFilm(null);
    if (!film) return;
    await commitWatched(film, rating);
    if (pendingFinishRef.current && !finishingRef.current) {
      pendingFinishRef.current = false;
      finishingRef.current = true;
      setShowFinishLine(true);
    }
  }, [ratingFilm, commitWatched]);

  // Swipe-up / Watched button: advance the deck immediately, then open the
  // existing RatingPickerDialog. POST /api/movies happens only after the
  // dialog resolves (with optional rating), matching add.tsx.
  const handleWatched = useCallback((film: SwipeFilm) => {
    markSeenToday(film.tmdbId);
    seenRef.current.add(film.tmdbId);
    advance({ deferFinish: true });
    setRatingFilm(film);
  }, [advance]);

  const handleUndo = useCallback(async () => {
    const item = undoStack[undoStack.length - 1];
    if (!item || showFinishLine) return;

    setUndoStack((s) => s.slice(0, -1));
    unmarkSeenToday(item.film.tmdbId);
    seenRef.current.delete(item.film.tmdbId);
    setQueue((q) => [item.film, ...q.filter((f) => f.tmdbId !== item.film.tmdbId)]);
    setDeckActions((a) => Math.max(0, a - 1));

    if (item.action === "watchlist") {
      setSavedFilms((s) => s.filter((f) => f.tmdbId !== item.film.tmdbId));
      dequeueOffline(item.film.tmdbId);
      if (item.movieId) await deleteMovie(item.movieId);
      qc.invalidateQueries({ queryKey: ["movies"] });
    }
    if (item.action === "watched") {
      setWatchedFilms((w) => w.filter((f) => f.tmdbId !== item.film.tmdbId));
      dequeueOffline(item.film.tmdbId);
      if (item.movieId) await deleteMovie(item.movieId);
      qc.invalidateQueries({ queryKey: ["movies"] });
    }

    toast.message("Undone", { duration: 1500 });
  }, [undoStack, showFinishLine, qc]);

  useEffect(() => {
    const current = queue[0];
    if (!current || showFinishLine || ratingFilm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleSave(current);
      if (e.key === "ArrowLeft")  handleSkip(current);
      if (e.key === "ArrowUp")    handleWatched(current);
      if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue, showFinishLine, ratingFilm, handleSave, handleSkip, handleWatched, handleUndo]);

  if (showFinishLine && !ratingFilm) {
    return (
      <FinishLineScreen
        saved={savedFilms}
        watched={watchedFilms}
        pendingCount={pendingCount}
        deckNumber={deckNumber}
        anotherDeckDisabled={exhausted && queue.length === 0}
        onAnotherDeck={() => {
          startDeck(apiPage, selectedGenreId, deckNumber + 1);
        }}
      />
    );
  }

  const current = queue[0];
  const isQueueEmpty = !loading && (queue.length === 0 || exhausted);
  const remainingInDeck = Math.max(0, deckSize - deckActions);
  const stackH = Math.round(CARD_W * 1.58) + 20;

  return (
    <Layout>
      <div className="flex flex-col items-center px-4 pt-4 pb-6 min-h-[calc(100dvh-4rem)]">

        {!isOnline && (
          <div className="w-full max-w-sm mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>You're offline — saves will sync automatically when you reconnect</span>
          </div>
        )}

        {isOnline && isRetrying && (
          <div className="w-full max-w-sm mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span>Syncing {pendingCount} queued save{pendingCount === 1 ? "" : "s"}…</span>
          </div>
        )}

        <div className="w-full max-w-sm mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Today’s deck</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading
                ? "Building a short list…"
                : `${remainingInDeck} left in deck ${deckNumber} · tap for details`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {!isOnline && <WifiOff className="w-3 h-3 text-amber-400" />}
            <span className="tabular-nums">{deckActions}/{deckSize}</span>
          </div>
        </div>

        {/* Deck progress */}
        <div className="w-full max-w-sm mb-3 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-white/70 transition-all duration-300"
            style={{ width: `${deckSize ? Math.min(100, (deckActions / deckSize) * 100) : 0}%` }}
          />
        </div>

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
            <p className="text-sm text-muted-foreground">Dealing {DECK_SIZE} films…</p>
          </div>

        ) : isQueueEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 max-w-xs">
            <div className="text-5xl">🎬</div>
            <div>
              <h2 className="text-xl font-bold mb-2">All caught up for today</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {savedFilms.length + watchedFilms.length > 0
                  ? "Come back tomorrow for a fresh deck — or review what you saved."
                  : "No new films match your preferences right now. Check back tomorrow."}
              </p>
            </div>
            {(savedFilms.length > 0 || watchedFilms.length > 0) && (
              <Button onClick={() => setShowFinishLine(true)} className="bg-white text-black hover:bg-white/90 gap-2">
                <Bookmark className="w-4 h-4" /> See your picks
              </Button>
            )}
          </div>

        ) : (
          <>
            <div className="relative w-full max-w-[340px]" style={{ height: stackH }}>
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

            <div className="flex items-center gap-5 mt-5">
              <button
                onClick={() => current && handleSkip(current)}
                aria-label="Skip"
                className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-rose-500/40 text-rose-400 hover:border-rose-500 hover:bg-rose-500/10 transition-all active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>

              <button
                onClick={() => current && handleWatched(current)}
                aria-label="Mark as watched"
                className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-blue-500/40 text-blue-400 hover:border-blue-500 hover:bg-blue-500/10 transition-all active:scale-90"
              >
                <CheckCircle2 className="w-6 h-6" />
              </button>

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

            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all",
                  undoStack.length === 0
                    ? "border-white/10 text-muted-foreground/40 cursor-not-allowed"
                    : "border-white/25 text-muted-foreground hover:text-foreground hover:border-white/40"
                )}
              >
                <Undo2 className="w-3.5 h-3.5" /> Undo last swipe
              </button>
              <p className="hidden sm:block text-[11px] text-muted-foreground">
                ← Skip · ↑ Watched · → Watchlist
              </p>
            </div>
          </>
        )}
      </div>

      <RatingPickerDialog
        open={!!ratingFilm}
        movieTitle={ratingFilm?.title ?? ""}
        confirmOnSelect
        onCancel={() => {
          // Gesture already committed — dismiss still logs watched, no rating
          // (same as dialog "Skip rating", unlike add.tsx which aborts entirely).
          void resolveWatchedRating(null);
        }}
        onConfirm={(rating) => {
          void resolveWatchedRating(rating);
        }}
      />
    </Layout>
  );
}

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
