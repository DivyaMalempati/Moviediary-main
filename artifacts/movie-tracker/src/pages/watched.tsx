import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { MoviePosterCard } from "@/components/movie-card";
import { LanguageBadge } from "@/components/language-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useListMovies, useGetMovieStats, useRewatchMovie, getListMoviesQueryKey, getGetMovieStatsQueryKey } from "@workspace/api-client-react";
import {
  Clapperboard, Search, Loader2, Upload, X, Download, ChevronDown, RotateCcw, Bell,
} from "lucide-react";
import { RewatchLogDialog } from "@/components/rewatch-log-dialog";
import {
  findAnniversaryReminders,
  formatAnniversaryCopy,
  isAnniversaryDismissed,
  dismissAnniversary,
  anniversaryPosterUrl,
  type AnniversaryFilm,
} from "@/lib/rewatch-reminders";
import {
  findReleaseReminders,
  formatReleaseCopy,
  formatReleaseDateLabel,
  isReleaseDismissed,
  dismissReleaseReminder,
  releasePosterUrl,
  type LookingForwardFilm,
} from "@/lib/release-reminders";
import { RATING_LABELS, formatWatchDate } from "@/lib/movie-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/demo-auth";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CURRENT_YEAR = new Date().getFullYear();

// ── Orphaned helpers ──────────────────────────────────────────────────────────
function useOrphanedCount() {
  return useQuery({
    queryKey: ["orphaned-count"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${BASE}/api/movies/orphaned-count`, { headers, credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
    staleTime: 60_000,
  });
}

function useClaimOrphaned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch(`${BASE}/api/movies/claim-orphaned`, { method: "POST", headers, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ claimed: number }>;
    },
    onSuccess: (data) => {
      toast.success(`${data.claimed} movies added to your library`);
      qc.invalidateQueries({ queryKey: ["orphaned-count"] });
      qc.invalidateQueries({ queryKey: ["movies"] });
      qc.invalidateQueries({ queryKey: ["movie-stats"] });
    },
    onError: (err) => toast.error(String(err)),
  });
}

// ── Sort ──────────────────────────────────────────────────────────────────────
const RATING_ORDER: Record<string, number> = { loved: 0, great: 1, very_good: 2, good: 3, ok: 4, avg: 5, meh: 6 };
type SortKey = "smart" | "newest" | "oldest" | "year_desc" | "rating_best" | "az";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "smart",       label: "Smart sections" },
  { value: "newest",      label: "Newest added" },
  { value: "oldest",      label: "Oldest added" },
  { value: "year_desc",   label: "Film year ↓" },
  { value: "rating_best", label: "Rating (best first)" },
  { value: "az",          label: "A–Z" },
];

function sortMovies(list: any[], sort: SortKey) {
  return [...list].sort((a, b) => {
    switch (sort) {
      case "smart":
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "year_desc":
        return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
      case "rating_best": {
        const ra = a.rating ? (RATING_ORDER[a.rating] ?? 99) : 99;
        const rb = b.rating ? (RATING_ORDER[b.rating] ?? 99) : 99;
        return ra !== rb ? ra - rb : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case "az":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ title, movies, badge, defaultOpen = true, onRewatch }: {
  title: string; movies: any[]; badge: number; defaultOpen?: boolean; onRewatch: (movie: any) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (movies.length === 0) return null;
  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors w-full text-left"
      >
        <ChevronDown className={cn("w-4 h-4 transition-transform duration-200 text-muted-foreground", !open && "-rotate-90")} />
        {title}
        <span className="ml-1 text-xs font-mono bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">{badge}</span>
      </button>
      {open && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 md:gap-6">
          {movies.map((movie) => (
            <MoviePosterCard
              key={movie.id}
              id={movie.id}
              title={movie.title}
              posterPath={movie.posterPath}
              language={movie.originalLanguage}
              rating={movie.rating}
              year={movie.releaseYear}
              rewatchCount={movie.rewatchCount}
              rewatchDates={movie.rewatchDates}
              watchedAt={movie.watchedAt}
              overlayAction={
                <Button
                  size="sm"
                  variant="secondary"
                  className="shadow-lg shadow-black/50 bg-white text-black hover:bg-white/90"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRewatch(movie);
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Rewatch
                </Button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WatchedPage() {
  const queryClient = useQueryClient();
  const rewatchMovie = useRewatchMovie();
  const [pendingRewatch, setPendingRewatch] = useState<any | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [releaseReminderDismissed, setReleaseReminderDismissed] = useState(false);
  const [genreFilter, setGenreFilter]     = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [ratingFilter, setRatingFilter]   = useState("all");
  const [search, setSearch]               = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => {
    try { return (localStorage.getItem("cinevault:sort") as SortKey) ?? "smart"; } catch { return "smart"; }
  });

  const updateSort = (s: SortKey) => {
    setSort(s);
    try { localStorage.setItem("cinevault:sort", s); } catch {}
  };

  const submitRewatch = (payload: { rating: string | null; watchedAt?: string | null }) => {
    if (!pendingRewatch) return;
    const id = pendingRewatch.id as number;
    if (!id) {
      toast.error("Couldn't log rewatch — film id missing");
      setPendingRewatch(null);
      return;
    }
    setPendingRewatch(null);
    const data: { rating?: string | null; watchedAt?: string | null } = {};
    if (payload.rating != null) data.rating = payload.rating;
    if (payload.watchedAt) data.watchedAt = payload.watchedAt;
    rewatchMovie.mutate(
      { id, data },
      {
        onSuccess: (movie) => {
          const times = 1 + (movie.rewatchCount ?? 0);
          toast.success(
            payload.watchedAt
              ? `Rewatch logged · ×${times} · ${formatWatchDate(payload.watchedAt)}`
              : `Rewatch logged · ×${times}`,
          );
          queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey({ status: "watched" }) });
          queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          queryClient.invalidateQueries({ queryKey: getGetMovieStatsQueryKey() });
        },
        onError: (err: any) => {
          const msg =
            err?.data?.error ||
            (typeof err?.message === "string" && err.message.startsWith("HTTP")
              ? err.message.replace(/^HTTP \d+[^:]*:?\s*/, "")
              : null) ||
            "Failed to log rewatch";
          toast.error(msg);
        },
      },
    );
  };

  const { data: stats }   = useGetMovieStats();
  const { data: movies, isLoading } = useListMovies({ status: "watched" });
  const { data: watchlist } = useListMovies({ status: "watchlist" });
  const { data: orphaned } = useOrphanedCount();
  const claim = useClaimOrphaned();

  const showBanner = !bannerDismissed && (orphaned?.count ?? 0) > 0;

  const anniversaryReminder: AnniversaryFilm | null = useMemo(() => {
    if (!movies?.length || reminderDismissed) return null;
    const candidates = findAnniversaryReminders(movies).filter((f) => !isAnniversaryDismissed(f.id));
    return candidates[0] ?? null;
  }, [movies, reminderDismissed]);

  const releaseReminder: LookingForwardFilm | null = useMemo(() => {
    if (!watchlist?.length || releaseReminderDismissed) return null;
    const candidates = findReleaseReminders(watchlist, { withinDays: 7 }).filter(
      (f) => !isReleaseDismissed(f.id, f.releaseDate),
    );
    return candidates[0] ?? null;
  }, [watchlist, releaseReminderDismissed]);

  // Unique genres from user's library
  const allGenres = useMemo(() => {
    const s = new Set<string>();
    movies?.forEach((m) => (m.genres as string[] | null)?.forEach((g) => s.add(g)));
    return Array.from(s).sort();
  }, [movies]);

  // Language options from library
  const allLanguages = useMemo(() => {
    const s = new Set<string>();
    movies?.forEach((m) => { if (m.originalLanguage) s.add(m.originalLanguage); });
    return Array.from(s).sort();
  }, [movies]);

  const LANG_NAMES: Record<string, string> = {
    te: "Telugu", ta: "Tamil", ml: "Malayalam", kn: "Kannada",
    hi: "Hindi", en: "English", ko: "Korean", ja: "Japanese",
    fr: "French", es: "Spanish", it: "Italian", de: "German", zh: "Chinese",
  };

  const isFiltered = genreFilter !== "all" || languageFilter !== "all" || ratingFilter !== "all" || search !== "";
  const useSections = sort === "smart" && !isFiltered;

  const filtered = useMemo(() => {
    return (movies ?? []).filter((m) => {
      if (genreFilter !== "all" && !(m.genres as string[] | null)?.includes(genreFilter)) return false;
      if (languageFilter !== "all" && m.originalLanguage?.toLowerCase() !== languageFilter.toLowerCase()) return false;
      if (ratingFilter !== "all" && m.rating !== ratingFilter) return false;
      if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [movies, genreFilter, languageFilter, ratingFilter, search]);

  // Smart sections
  const needsRating  = useMemo(() => useSections ? filtered.filter((m) => !m.rating) : [], [filtered, useSections]);
  const thisYear     = useMemo(() => useSections ? filtered.filter((m) => m.rating && new Date(m.createdAt).getFullYear() === CURRENT_YEAR) : [], [filtered, useSections]);
  const earlier      = useMemo(() => useSections ? filtered.filter((m) => m.rating && new Date(m.createdAt).getFullYear() < CURRENT_YEAR) : [], [filtered, useSections]);

  // Flat sorted list
  const sortedMovies = useMemo(() => useSections ? [] : sortMovies(filtered, sort), [filtered, sort, useSections]);

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Claim-orphaned banner */}
        {showBanner && (
          <div className="relative flex items-start gap-4 rounded-xl border border-white/20 bg-white/5 px-5 py-4">
            <Upload className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Found {orphaned!.count} movies from before you signed in</p>
              <p className="text-xs text-muted-foreground mt-0.5">These were added without an account. Claim them to add them to your library.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a href={`${BASE}/api/movies/export-orphaned`} download="cinevault_orphaned_movies.csv"
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
                <Download className="w-3 h-3" /> CSV
              </a>
              <Button size="sm" className="bg-white text-black hover:bg-white/90 h-7 text-xs gap-1"
                onClick={() => claim.mutate()} disabled={claim.isPending}>
                {claim.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Claim {orphaned!.count} movies
              </Button>
              <button onClick={() => setBannerDismissed(true)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Smart rewatch anniversary reminder */}
        {anniversaryReminder && (
          <div className="relative flex items-start gap-4 rounded-xl border border-amber-400/30 bg-amber-400/5 px-5 py-4">
            {anniversaryPosterUrl(anniversaryReminder) ? (
              <img
                src={anniversaryPosterUrl(anniversaryReminder)!}
                alt=""
                className="w-12 h-[72px] rounded-md object-cover shrink-0 shadow"
              />
            ) : (
              <div className="w-12 h-[72px] rounded-md bg-secondary flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">
                {formatAnniversaryCopy(anniversaryReminder)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Based on the last time you logged this film as watched.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  className="bg-white text-black hover:bg-white/90 h-7 text-xs gap-1"
                  onClick={() => setPendingRewatch(anniversaryReminder)}
                >
                  <RotateCcw className="w-3 h-3" />
                  Log rewatch
                </Button>
                <Link href={`/movie/${anniversaryReminder.id}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    Open film
                  </Button>
                </Link>
              </div>
            </div>
            <button
              onClick={() => {
                dismissAnniversary(anniversaryReminder.id);
                setReminderDismissed(true);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0"
              aria-label="Dismiss reminder"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Looking-forward release reminder */}
        {releaseReminder && (
          <div className="relative flex items-start gap-4 rounded-xl border border-sky-400/30 bg-sky-400/5 px-5 py-4">
            {releasePosterUrl(releaseReminder) ? (
              <img
                src={releasePosterUrl(releaseReminder)!}
                alt=""
                className="w-12 h-[72px] rounded-md object-cover shrink-0 shadow"
              />
            ) : (
              <div className="w-12 h-[72px] rounded-md bg-secondary flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">
                {formatReleaseCopy(releaseReminder)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatReleaseDateLabel(releaseReminder.releaseDate)} · from Looking forward
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Link href={`/movie/${releaseReminder.id}`}>
                  <Button size="sm" className="bg-white text-black hover:bg-white/90 h-7 text-xs">
                    Open film
                  </Button>
                </Link>
                <Link href="/upcoming">
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    All upcoming
                  </Button>
                </Link>
              </div>
            </div>
            <button
              onClick={() => {
                dismissReleaseReminder(releaseReminder.id, releaseReminder.releaseDate);
                setReleaseReminderDismissed(true);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0"
              aria-label="Dismiss release reminder"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Header */}
        <section className="relative overflow-hidden rounded-2xl bg-card border border-border p-6 shadow-sm">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Clapperboard className="w-32 h-32" />
          </div>
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold mb-2">My Cinema</h1>
                <p className="text-muted-foreground flex items-center gap-2">
                  <span className="font-mono text-primary font-bold text-lg">{stats?.totalWatched || 0}</span> films watched
                </p>
              </div>
            </div>
            {stats?.byLanguage && stats.byLanguage.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {stats.byLanguage.map((lang) => (
                  <div key={lang.key} className="flex items-center gap-1.5 bg-secondary/50 rounded-full px-3 py-1 border border-border text-sm">
                    <LanguageBadge language={lang.key} />
                    <span className="font-mono">{lang.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Genre pill bar */}
        {allGenres.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <button
              onClick={() => setGenreFilter("all")}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                genreFilter === "all"
                  ? "bg-white text-black border-white"
                  : "bg-transparent border-border text-muted-foreground hover:border-white/30 hover:text-foreground"
              )}
            >
              All genres
            </button>
            {allGenres.map((g) => (
              <button
                key={g}
                onClick={() => setGenreFilter(genreFilter === g ? "all" : g)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                  genreFilter === g
                    ? "bg-white text-black border-white"
                    : "bg-transparent border-border text-muted-foreground hover:border-white/30 hover:text-foreground"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Filters + Sort */}
        <section className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search watched…" className="pl-9 bg-card border-border"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-[120px] bg-card">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Langs</SelectItem>
                {allLanguages.map((l) => (
                  <SelectItem key={l} value={l}>{LANG_NAMES[l] ?? l.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-[130px] bg-card">
                <SelectValue placeholder="Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                {Object.entries(RATING_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => updateSort(v as SortKey)}>
              <SelectTrigger className="w-[160px] bg-card">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-border border-dashed">
            <Clapperboard className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No films found</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-4">
              {(movies?.length ?? 0) === 0 ? "Start adding movies to build your library." : "Try adjusting your filters."}
            </p>
            {(movies?.length ?? 0) === 0 && (
              <div className="flex items-center justify-center gap-3">
                <Link href="/add"><Button size="sm" className="bg-white text-black hover:bg-white/90">Search & add</Button></Link>
                <Link href="/profile"><Button size="sm" variant="outline" className="gap-1.5"><Upload className="w-3.5 h-3.5" /> Import / Export</Button></Link>
              </div>
            )}
          </div>
        ) : useSections ? (
          <div className="space-y-8">
            <Section title="Needs a rating" badge={needsRating.length} movies={needsRating} defaultOpen={true} onRewatch={setPendingRewatch} />
            <Section title={`Added in ${CURRENT_YEAR}`} badge={thisYear.length} movies={thisYear} defaultOpen={true} onRewatch={setPendingRewatch} />
            <Section title="Earlier" badge={earlier.length} movies={earlier} defaultOpen={true} onRewatch={setPendingRewatch} />
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 md:gap-6">
            {sortedMovies.map((movie) => (
              <MoviePosterCard
                key={movie.id}
                id={movie.id}
                title={movie.title}
                posterPath={movie.posterPath}
                language={movie.originalLanguage}
                rating={movie.rating}
                year={movie.releaseYear}
                rewatchCount={movie.rewatchCount}
                rewatchDates={movie.rewatchDates}
                watchedAt={movie.watchedAt}
                overlayAction={
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-lg shadow-black/50 bg-white text-black hover:bg-white/90"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingRewatch(movie);
                    }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Rewatch
                  </Button>
                }
              />
            ))}
          </div>
        )}

        <RewatchLogDialog
          open={!!pendingRewatch}
          movieTitle={pendingRewatch?.title ?? ""}
          onConfirm={submitRewatch}
          onCancel={() => setPendingRewatch(null)}
        />

      </div>
    </Layout>
  );
}
