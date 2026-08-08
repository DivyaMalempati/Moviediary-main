import { useMemo, useState } from "react";
import { Link } from "wouter";
import { MoviePosterCard } from "@/components/movie-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListMovies, useUpdateMovie, getListMoviesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Bookmark, CalendarClock, Download, Loader2, Search, Star, X } from "lucide-react";
import { isFeatureEnabled } from "@/lib/features";
import {
  dismissReleaseReminder,
  findReleaseReminders,
  formatReleaseCopy,
  formatReleaseDateLabel,
  isReleaseDismissed,
  releasePosterUrl,
  type LookingForwardFilm,
} from "@/lib/release-reminders";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { toast } from "sonner";

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(movies: any[], filename: string) {
  const cols = ["title", "status", "rating", "year", "language", "genres", "overview", "added"];
  const rows = movies.map((m) => [
    m.title,
    "watchlist",
    "",
    m.releaseYear ?? "",
    m.originalLanguage ?? "",
    (m.genres as string[] | null)?.join("; ") ?? "",
    m.overview ?? "",
    m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "",
  ]);
  const csv = [cols, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sort ──────────────────────────────────────────────────────────────────────
type SortKey = "year_desc" | "newest" | "oldest" | "az" | "release_soon";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "year_desc", label: "Film year ↓" },
  { value: "newest", label: "Newest added" },
  { value: "oldest", label: "Oldest added" },
  { value: "release_soon", label: "Release date" },
  { value: "az", label: "A–Z" },
];

const SORT_STORAGE_KEY = "cinevault:watchlist-sort";

function sortWatchlist(list: any[], sort: SortKey) {
  return [...list].sort((a, b) => {
    switch (sort) {
      case "year_desc":
        return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "release_soon": {
        const ad = a.releaseDate ? new Date(`${a.releaseDate}T12:00:00`).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.releaseDate ? new Date(`${b.releaseDate}T12:00:00`).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
      }
      case "az":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });
}

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const { data: movies, isLoading } = useListMovies({ status: "watchlist" });
  const updateMovie = useUpdateMovie();

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [releaseReminderDismissed, setReleaseReminderDismissed] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY) as SortKey | null;
      if (saved && SORT_OPTIONS.some((o) => o.value === saved)) return saved;
    } catch {
      /* ignore */
    }
    return "year_desc";
  });

  const updateSort = (s: SortKey) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, s);
    } catch {
      /* ignore */
    }
  };

  const pendingMovie = movies?.find((m) => m.id === pendingId);

  const releaseReminder: LookingForwardFilm | null = useMemo(() => {
    if (!movies?.length || releaseReminderDismissed) return null;
    const candidates = findReleaseReminders(movies, {
      withinDays: 7,
      includePastDays: 14,
    }).filter((f) => !isReleaseDismissed(f.id, f.releaseDate));
    return candidates[0] ?? null;
  }, [movies, releaseReminderDismissed]);

  const unreleasedCount = useMemo(
    () =>
      (movies ?? []).filter((m) =>
        m.releaseDate
          ? new Date(`${m.releaseDate}T12:00:00`) > new Date()
          : false,
      ).length,
    [movies],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = (movies ?? []).filter((m) => {
      // Exclude unreleased movies — they live on the Upcoming page
      const isFuture = m.releaseDate
        ? new Date(`${m.releaseDate}T12:00:00`) > new Date()
        : false;
      if (isFuture) return false;
      if (q && !m.title.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortWatchlist(base, sort);
  }, [movies, query, sort]);

  const handleMarkWatched = (id: number) => setPendingId(id);

  const submitWatched = (payload: { rating: string | null; watchedAt: string | null }) => {
    if (!pendingId) return;
    updateMovie.mutate(
      {
        id: pendingId,
        data: {
          status: "watched",
          rating: payload.rating ?? null,
          watchedAt: payload.watchedAt,
        },
      },
      {
        onSuccess: () => {
          toast.success("Marked as watched!");
          queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey() });
          setPendingId(null);
        },
        onError: () => {
          toast.error("Failed to update movie");
          setPendingId(null);
        },
      },
    );
  };

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
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
                {formatReleaseDateLabel(releaseReminder.releaseDate)}
                {releaseReminder.daysUntil < 0 ? " · just out" : " · on your watchlist"}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Link href={`/movie/${releaseReminder.id}`}>
                  <Button size="sm" className="bg-white text-black hover:bg-white/90 h-7 text-xs">
                    Open film
                  </Button>
                </Link>
                {isFeatureEnabled("upcoming") && (
                  <Link href="/upcoming">
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      All upcoming
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            <button
              type="button"
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

        {unreleasedCount > 0 && (
          <Link
            href="/upcoming"
            className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors"
          >
            <CalendarClock className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm flex-1">
              <span className="font-medium">{unreleasedCount} unreleased {unreleasedCount === 1 ? "film" : "films"}</span>
              <span className="text-muted-foreground"> moved to Upcoming</span>
            </span>
            <span className="text-xs text-primary font-medium shrink-0">View →</span>
          </Link>
        )}

        <div className="flex items-center justify-between gap-4">
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8 shrink-0"
              onClick={() => exportCSV(movies ?? [], "cinevault_watchlist.csv")}
              disabled={!movies?.length}
            >
              <Download className="w-3 h-3" /> Export
            </Button>
          </div>
        </div>

        {!isLoading && (movies?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1 min-w-[12rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your watchlist…"
                className="pl-9 pr-9 bg-card border-border"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Select value={sort} onValueChange={(v) => updateSort(v as SortKey)}>
              <SelectTrigger className="w-[160px] bg-card">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : movies?.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-border border-dashed">
            <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">Your watchlist is empty</h3>
            <p className="text-muted-foreground text-sm mt-1">Discover new films and add them here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-border border-dashed">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No results for &quot;{query}&quot;</h3>
            <p className="text-muted-foreground text-sm mt-1">Try a different title.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 md:gap-6">
            {filtered.map((movie) => (
              <MoviePosterCard
                key={movie.id}
                id={movie.id}
                title={movie.title}
                posterPath={movie.posterPath}
                language={movie.originalLanguage}
                year={movie.releaseYear}
                overlayAction={(() => {
                  const isFuture = movie.releaseDate
                    ? new Date(`${movie.releaseDate}T12:00:00`) > new Date()
                    : false;
                  if (isFuture) return undefined;
                  return (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shadow-lg shadow-black/50 bg-white text-black hover:bg-white/90"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleMarkWatched(movie.id);
                      }}
                    >
                      <Star className="w-4 h-4 mr-2" />
                      Rate
                    </Button>
                  );
                })()}
              />
            ))}
          </div>
        )}

        <RatingPickerDialog
          open={!!pendingId}
          movieTitle={pendingMovie?.title ?? ""}
          confirmOnSelect
          onConfirm={submitWatched}
          onCancel={() => setPendingId(null)}
        />
      </div>
    </>
  );
}
