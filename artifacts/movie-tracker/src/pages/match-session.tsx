import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { getPosterUrl } from "@/lib/movie-utils";
import { getAuthHeaders } from "@/lib/demo-auth";
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
import { useQueryClient } from "@tanstack/react-query";
import { getListMoviesQueryKey } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

export default function MatchSessionPage() {
  const params = useParams();
  const sessionId = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState<DeckFilm | null>(null);
  const [logFilm, setLogFilm] = useState<DeckFilm | null>(null);
  const [acted, setActed] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${BASE}/api/match-sessions/${sessionId}`, {
        headers: await getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as SessionPayload;
      setSession(data);
      if (data.meUserId) {
        setActed(
          new Set(
            data.swipes.filter((s) => s.userId === data.meUserId).map((s) => s.tmdbId),
          ),
        );
      }
    } catch {
      toast.error("Couldn’t load watch-together session");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const remaining = useMemo(() => {
    if (!session) return [];
    return session.deck.filter((f) => !acted.has(f.tmdbId));
  }, [session, acted]);

  const current = remaining[0] ?? null;

  const swipe = async (direction: "like" | "pass") => {
    if (!current || busy) return;
    setBusy(true);
    const film = current;
    setActed((prev) => new Set(prev).add(film.tmdbId));
    try {
      const res = await fetch(`${BASE}/api/match-sessions/${sessionId}/swipes`, {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ tmdbId: film.tmdbId, direction }),
      });
      if (!res.ok) throw new Error("swipe failed");
      const data = (await res.json()) as { matched: boolean; film: DeckFilm | null };
      if (data.matched && data.film) {
        setCelebration(data.film);
      }
      await refresh();
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
  };

  const logMatch = async (rating: string | null) => {
    if (!logFilm) return;
    const film = logFilm;
    setLogFilm(null);
    try {
      const res = await fetch(`${BASE}/api/match-sessions/${sessionId}/log-match`, {
        method: "POST",
        headers: await getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ tmdbId: film.tmdbId, rating }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Couldn’t log match");
        return;
      }
      toast.success(`Logged to both diaries · ${film.title}`);
      queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey({ status: "watched" }) });
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      setCelebration(null);
      await refresh();
    } catch {
      toast.error("Couldn’t log match");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout>
        <div className="p-8 text-center space-y-4">
          <p>Match session not found.</p>
          <Button variant="outline" onClick={() => setLocation("/partner")}>
            Back to Together
          </Button>
        </div>
      </Layout>
    );
  }

  const posterUrl = current ? getPosterUrl(current.posterPath, "w780") : null;

  return (
    <Layout>
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
          <div className="rounded-2xl border border-border bg-secondary/30 p-8 text-center space-y-4">
            <Check className="w-10 h-10 mx-auto text-primary" />
            <h2 className="text-xl font-semibold">Deck complete</h2>
            <p className="text-sm text-muted-foreground">
              {session.matches.length > 0
                ? `You matched on ${session.matches.length} film${session.matches.length === 1 ? "" : "s"}.`
                : "No mutual likes yet — start another deck when you’re ready."}
            </p>
            {session.matches.length > 0 && (
              <ul className="space-y-2 text-left">
                {session.matches.map((m) => (
                  <li
                    key={m.tmdbId}
                    className="flex items-center gap-3 rounded-lg bg-background/60 border border-border px-3 py-2"
                  >
                    {m.posterPath && (
                      <img
                        src={getPosterUrl(m.posterPath) ?? ""}
                        alt=""
                        className="w-10 h-14 object-cover rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.releaseYear}</p>
                    </div>
                    <Button size="sm" onClick={() => setLogFilm(m)}>
                      Log both
                    </Button>
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
                onClick={() => swipe("pass")}
              >
                <X className="w-6 h-6" />
              </Button>
              <Button
                size="lg"
                className={cn("rounded-full w-14 h-14 bg-primary text-primary-foreground")}
                disabled={busy}
                onClick={() => swipe("like")}
              >
                <Heart className="w-6 h-6" />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {remaining.length} left in this shared deck
            </p>
          </div>
        )}
      </div>

      {/* IT'S A MATCH overlay + popcorn / confetti burst */}
      <AnimatePresence>
        {celebration && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MatchCelebrationBurst active />
            <motion.div
              className="relative z-[91] max-w-sm w-full rounded-2xl border border-primary/40 bg-background p-6 text-center space-y-4 shadow-2xl"
              initial={{ scale: 0.7, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
            >
              <motion.div
                initial={{ rotate: -12, scale: 0.5 }}
                animate={{ rotate: [0, -8, 8, 0], scale: 1 }}
                transition={{ duration: 0.7 }}
              >
                <Popcorn className="w-12 h-12 mx-auto text-amber-300" />
              </motion.div>
              <h2 className="text-2xl font-bold tracking-tight">IT&apos;S A MATCH!</h2>
              <p className="text-sm text-muted-foreground">
                You both liked{" "}
                <span className="text-foreground font-medium">{celebration.title}</span>
              </p>
              {celebration.posterPath && (
                <motion.img
                  src={getPosterUrl(celebration.posterPath, "w500") ?? ""}
                  alt={celebration.title}
                  className="mx-auto w-32 rounded-lg shadow-lg"
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.12 }}
                />
              )}
              <div className="flex flex-col gap-2">
                <Button onClick={() => setLogFilm(celebration)}>
                  Log to both Watched diaries
                </Button>
                <Button variant="ghost" onClick={() => setCelebration(null)}>
                  Keep swiping
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RatingPickerDialog
        open={!!logFilm}
        movieTitle={logFilm?.title ?? ""}
        confirmOnSelect
        skipLabel="Skip rating · still log for both"
        onConfirm={logMatch}
        onCancel={() => setLogFilm(null)}
      />
    </Layout>
  );
}
