import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getPosterUrl } from "@/lib/movie-utils";
import { authFetch } from "@/lib/demo-auth";
import { invalidateLibrary } from "@/lib/queryClient";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { MatchCelebrationBurst } from "@/components/match-celebration-burst";
import { toast } from "sonner";
import {
  Loader2,
  Heart,
  X,
  Check,
  ArrowLeft,
  Popcorn,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Brief cue on each mutual like — full match list lives at deck end. */
const MATCH_TOAST_MS = 2200;

type DeckFilm = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  overview: string | null;
  genres: string[] | null;
  voteAverage?: number | null;
  source?: string;
};

type SessionPayload = {
  id: number;
  partnerUserId: string;
  meUserId?: string;
  status: string;
  deck: DeckFilm[];
  swipes: Array<{ userId: string; tmdbId: number; direction: string }>;
  matches: DeckFilm[];
  mySwipeCount: number;
  partnerSwipeCount: number;
};

async function fetchMatchSession(sessionId: number): Promise<SessionPayload> {
  const res = await authFetch(`${BASE}/api/match-sessions/${sessionId}`);
  if (!res.ok) throw new Error("load failed");
  return (await res.json()) as SessionPayload;
}

export default function MatchSessionPage() {
  const params = useParams();
  const sessionId = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState<DeckFilm | null>(null);
  const [logFilm, setLogFilm] = useState<DeckFilm | null>(null);
  const [acted, setActed] = useState<Set<number>>(new Set());

  const {
    data: session,
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["match-session", sessionId],
    queryFn: () => fetchMatchSession(sessionId),
    enabled: sessionId > 0,
    refetchInterval: 4000,
    staleTime: 2000,
  });

  useEffect(() => {
    if (!session?.meUserId) return;
    setActed(
      new Set(
        session.swipes
          .filter((s) => s.userId === session.meUserId)
          .map((s) => s.tmdbId),
      ),
    );
  }, [session]);

  useEffect(() => {
    if (isError) toast.error("Couldn’t load watch-together session");
  }, [isError]);

  // Auto-dismiss the compact match cue so swiping stays uninterrupted.
  useEffect(() => {
    if (!celebration) return;
    const t = window.setTimeout(() => setCelebration(null), MATCH_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [celebration]);

  const remaining = useMemo(() => {
    if (!session) return [];
    return session.deck.filter((f) => !acted.has(f.tmdbId));
  }, [session, acted]);

  const current = remaining[0] ?? null;

  const swipe = useCallback(
    async (direction: "like" | "pass") => {
      if (!current || busy || !sessionId) return;
      setBusy(true);
      const film = current;
      setActed((prev) => new Set(prev).add(film.tmdbId));
      try {
        const res = await authFetch(`${BASE}/api/match-sessions/${sessionId}/swipes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmdbId: film.tmdbId, direction }),
        });
        if (!res.ok) throw new Error("swipe failed");
        const data = (await res.json()) as {
          matched: boolean;
          film: DeckFilm | null;
          addedToWatchlist?: boolean;
        };
        if (direction === "like" && data.addedToWatchlist) {
          void invalidateLibrary(queryClient);
        }
        if (data.matched && data.film) {
          setCelebration(data.film);
        }
        await refetch();
      } catch {
        toast.error("Swipe didn’t save — try again");
        setActed((prev) => {
          const next = new Set(prev);
          next.delete(film.tmdbId);
          return next;
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, current, queryClient, refetch, sessionId],
  );

  // Keyboard: ← pass, → like (parity with solo Swipe).
  useEffect(() => {
    if (!current || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void swipe("pass");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void swipe("like");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, current, swipe]);

  const logMatch = async (rating: string | null) => {
    if (!logFilm) return;
    const film = logFilm;
    setLogFilm(null);
    try {
      const res = await authFetch(`${BASE}/api/match-sessions/${sessionId}/log-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: film.tmdbId, rating }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Couldn’t log match");
        return;
      }
      toast.success(`Logged to your diary · ${film.title}`);
      void invalidateLibrary(queryClient);
      setCelebration(null);
      await refetch();
    } catch {
      toast.error("Couldn’t log match");
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-center space-y-4">
        <p>Match session not found.</p>
        <Button variant="outline" onClick={() => setLocation("/partner")}>
          Back to Together
        </Button>
      </div>
    );
  }

  const posterUrl = current ? getPosterUrl(current.posterPath, "w780") : null;

  return (
    <>
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/partner">
              <ArrowLeft className="w-4 h-4 mr-1" /> Together
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => {
                const url = `${window.location.origin}${BASE}/match/${sessionId}`;
                void navigator.clipboard.writeText(url).then(
                  () => toast.success("Link copied — send it so they can swipe the same deck"),
                  () => toast.message(url),
                );
              }}
            >
              <Copy className="w-3 h-3" />
              Share
            </Button>
            <p className="text-xs text-muted-foreground tabular-nums">
              You {session.mySwipeCount} · Them {session.partnerSwipeCount} ·{" "}
              {session.matches.length} match{session.matches.length === 1 ? "" : "es"}
            </p>
          </div>
        </div>

        {!current ? (
          <div className="rounded-2xl border border-border bg-secondary/30 p-6 text-center space-y-5">
            <div className="space-y-2">
              <Check className="w-9 h-9 mx-auto text-primary" />
              <h2 className="text-xl font-semibold">Your matches</h2>
              <p className="text-sm text-muted-foreground">
                {session.matches.length > 0
                  ? `${session.matches.length} film${session.matches.length === 1 ? "" : "s"} you both liked — log what you’ve watched to your diary.`
                  : "No mutual likes yet — start another deck when you’re ready."}
              </p>
            </div>

            {session.matches.length > 0 && (
              <ul className="grid grid-cols-3 gap-2.5 text-left">
                {session.matches.map((m) => (
                  <li
                    key={m.tmdbId}
                    className="rounded-xl border border-border bg-background/70 overflow-hidden flex flex-col"
                  >
                    <div className="aspect-[2/3] bg-secondary">
                      {m.posterPath ? (
                        <img
                          src={getPosterUrl(m.posterPath, "w500") ?? ""}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground p-1 text-center">
                          {m.title}
                        </div>
                      )}
                    </div>
                    <div className="p-1.5 space-y-1.5 flex-1 flex flex-col">
                      <p className="text-[11px] font-medium leading-tight line-clamp-2">{m.title}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[11px] w-full mt-auto"
                        onClick={() => setLogFilm(m)}
                      >
                        Log mine
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => setLocation("/partner")}>New session</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative aspect-[2/3] rounded-2xl overflow-hidden border border-border bg-secondary">
              {posterUrl ? (
                <img src={posterUrl} alt={current.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No poster
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-16">
                <h2 className="text-xl font-semibold text-white">{current.title}</h2>
                <p className="text-sm text-white/70">
                  {[current.releaseYear, current.source].filter(Boolean).join(" · ")}
                </p>
                {current.overview && (
                  <p className="text-xs text-white/60 mt-2 line-clamp-3">{current.overview}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-6">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full w-14 h-14"
                disabled={busy}
                aria-label={`Pass on ${current.title}`}
                onClick={() => void swipe("pass")}
              >
                <X className="w-6 h-6" aria-hidden />
              </Button>
              <Button
                size="lg"
                className={cn("rounded-full w-14 h-14 bg-primary text-primary-foreground")}
                disabled={busy}
                aria-label={`Like ${current.title}`}
                onClick={() => void swipe("like")}
              >
                <Heart className="w-6 h-6" aria-hidden />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {remaining.length} left · ← pass · → like · matches at the end
            </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {celebration && current && (
          <motion.div
            className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] flex justify-center px-4 pointer-events-none"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          >
            <MatchCelebrationBurst active compact />
            <div className="pointer-events-auto relative z-[91] flex items-center gap-2.5 max-w-sm w-full rounded-2xl border border-amber-400/35 bg-background/95 backdrop-blur-md px-3 py-2.5 shadow-xl">
              {celebration.posterPath ? (
                <img
                  src={getPosterUrl(celebration.posterPath, "w500") ?? ""}
                  alt=""
                  className="w-9 h-[3.25rem] object-cover rounded-md shrink-0"
                />
              ) : (
                <div className="w-9 h-[3.25rem] rounded-md bg-secondary shrink-0 flex items-center justify-center">
                  <Popcorn className="w-4 h-4 text-amber-300" />
                </div>
              )}
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
                  Match
                </p>
                <p className="text-sm font-medium truncate">{celebration.title}</p>
                <p className="text-[11px] text-muted-foreground">See all at the end of the deck</p>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground shrink-0 px-1"
                onClick={() => setCelebration(null)}
              >
                OK
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {celebration && !current && (
          <motion.div
            className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] flex justify-center px-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-background/95 px-3 py-1.5 text-xs shadow-lg">
              <Popcorn className="w-3.5 h-3.5 text-amber-300" />
              <span className="font-medium truncate max-w-[14rem]">{celebration.title}</span>
              <span className="text-muted-foreground">matched</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RatingPickerDialog
        open={!!logFilm}
        movieTitle={logFilm?.title ?? ""}
        confirmOnSelect
        skipLabel="Skip rating · still log for me"
        onConfirm={logMatch}
        onCancel={() => setLogFilm(null)}
      />
    </>
  );
}
