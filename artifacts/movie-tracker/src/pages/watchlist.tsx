import { useState } from "react";
import { Link } from "wouter";
import { MoviePosterCard } from "@/components/movie-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListMovies, useUpdateMovie, getListMoviesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, Download, Loader2, Search, Star, X } from "lucide-react";
import { isFeatureEnabled } from "@/lib/features";

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
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { toast } from "sonner";

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const { data: movies, isLoading } = useListMovies({ status: "watchlist" });
  const updateMovie = useUpdateMovie();

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const pendingMovie = movies?.find((m) => m.id === pendingId);

  const filtered = query.trim()
    ? movies?.filter((m) =>
        m.title.toLowerCase().includes(query.toLowerCase())
      )
    : movies;

  const handleMarkWatched = (id: number) => setPendingId(id);

  const submitWatched = (rating: string | null) => {
    if (!pendingId) return;
    updateMovie.mutate(
      { id: pendingId, data: { status: "watched", rating: rating ?? null } },
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
      }
    );
  };

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        <section className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Bookmark className="w-8 h-8 text-primary" />
              Watchlist
            </h1>
            <p className="text-muted-foreground">Films you want to explore.</p>
            {isFeatureEnabled("upcoming") && (
              <Link href="/upcoming" className="text-xs text-primary hover:underline w-fit">
                Looking for theatrical dates? Open Upcoming →
              </Link>
            )}
          </div>
          <Button
            variant="outline" size="sm"
            className="gap-1.5 text-xs h-8 shrink-0 mt-1"
            onClick={() => exportCSV(movies ?? [], "cinevault_watchlist.csv")}
            disabled={!movies?.length}
          >
            <Download className="w-3 h-3" /> Export
          </Button>
        </section>

        {/* Search */}
        {!isLoading && (movies?.length ?? 0) > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your watchlist…"
              className="pl-9 pr-9 bg-card border-border"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
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
        ) : filtered?.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-border border-dashed">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No results for "{query}"</h3>
            <p className="text-muted-foreground text-sm mt-1">Try a different title.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {filtered?.map((movie) => (
              <MoviePosterCard
                key={movie.id}
                id={movie.id}
                title={movie.title}
                posterPath={movie.posterPath}
                language={movie.originalLanguage}
                year={movie.releaseYear}
                overlayAction={
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
                }
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
