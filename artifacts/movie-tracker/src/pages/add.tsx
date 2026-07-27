import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { TmdbMovieCard } from "@/components/tmdb-movie-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useSearchTmdb,
  getSearchTmdbQueryKey,
  useCreateMovie,
  useMatchAllMovies,
  useListMovies,
  getListMoviesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Globe, MapPin, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";

export default function AddPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);
  const [region, setRegion] = useState("IN");
  const [pendingWatched, setPendingWatched] = useState<any | null>(null);

  const queryClient = useQueryClient();
  const createMovie = useCreateMovie();
  const matchAll = useMatchAllMovies();

  // Load library so we can show "In Library" on cards already saved
  const { data: library } = useListMovies(undefined, {
    query: { queryKey: getListMoviesQueryKey() },
  });

  // Map tmdbId → { status } for fast lookup
  const libraryMap = useMemo(() => {
    const m = new Map<number, { status: string }>();
    (library ?? []).forEach((mv) => {
      if (mv.tmdbId != null) m.set(mv.tmdbId, { status: mv.status });
    });
    return m;
  }, [library]);

  const { data: results, isLoading: isSearching } = useSearchTmdb(
    { q: debouncedQuery, region: region === "IN" ? "IN" : undefined },
    {
      query: {
        enabled: debouncedQuery.length > 1,
        queryKey: getSearchTmdbQueryKey({
          q: debouncedQuery,
          region: region === "IN" ? "IN" : undefined,
        }),
      },
    }
  );

  const doAdd = (movie: any, status: "watched" | "watchlist", rating?: string | null) => {
    createMovie.mutate(
      {
        data: {
          title: movie.title,
          status,
          ...(rating ? { rating } : {}),
          // Strip nulls — schema uses .optional() which rejects null
          ...(movie.tmdbId != null && { tmdbId: movie.tmdbId }),
          ...(movie.posterPath != null && { posterPath: movie.posterPath }),
          ...(movie.releaseYear != null && { releaseYear: movie.releaseYear }),
          ...(movie.originalLanguage != null && { originalLanguage: movie.originalLanguage }),
          ...(movie.genres != null && { genres: movie.genres }),
          ...(movie.overview != null && { overview: movie.overview }),
        },
      },
      {
        onSuccess: () => {
          toast.success(`Added "${movie.title}" to ${status}`);
          queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          queryClient.invalidateQueries({ queryKey: ["/api/movies/stats"] });
        },
        onError: (err: any) => {
          if (err?.response?.status === 409 || err?.status === 409) {
            toast.info(`"${movie.title}" is already in your library`);
            queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          } else {
            toast.error(`Failed to add "${movie.title}"`);
          }
        },
      }
    );
  };

  const handleAdd = (movie: any, status: "watched" | "watchlist") => {
    if (status === "watched") {
      setPendingWatched(movie);
    } else {
      doAdd(movie, "watchlist");
    }
  };

  const handleMatchAll = () => {
    matchAll.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(`Matched ${data.matched} movies. ${data.failed} failed.`);
        queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      },
    });
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <section className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Search</h1>
          <p className="text-muted-foreground">Find films from TMDB to add to your vault.</p>
        </section>

        <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm sticky top-0 z-20 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by title..."
              className="pl-12 h-14 text-lg bg-background border-border shadow-inner"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <ToggleGroup
              type="single"
              value={region}
              onValueChange={(v) => v && setRegion(v)}
              className="justify-start"
            >
              <ToggleGroupItem value="IN" aria-label="Indian Cinema">
                <MapPin className="w-4 h-4 mr-2" />
                India
              </ToggleGroupItem>
              <ToggleGroupItem value="GLOBAL" aria-label="Global">
                <Globe className="w-4 h-4 mr-2" />
                Global
              </ToggleGroupItem>
            </ToggleGroup>

            <Button
              variant="outline"
              size="sm"
              onClick={handleMatchAll}
              disabled={matchAll.isPending}
              className="text-xs"
            >
              {matchAll.isPending ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3 mr-2" />
              )}
              Match Unlinked
            </Button>
          </div>
        </div>

        <div className="space-y-4 pb-20">
          {isSearching && debouncedQuery.length > 1 ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : results && results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((movie) => {
                const lib = libraryMap.get(movie.tmdbId);
                const isPendingThis =
                  createMovie.isPending &&
                  createMovie.variables?.data.tmdbId === movie.tmdbId;
                return (
                  <TmdbMovieCard
                    key={movie.tmdbId}
                    {...movie}
                    inLibrary={!!lib}
                    libraryStatus={lib?.status as "watched" | "watchlist" | undefined}
                    onAddWatched={() => handleAdd(movie, "watched")}
                    onAddWatchlist={() => handleAdd(movie, "watchlist")}
                    isAddingWatched={isPendingThis && createMovie.variables?.data.status === "watched"}
                    isAddingWatchlist={isPendingThis && createMovie.variables?.data.status === "watchlist"}
                  />
                );
              })}
            </div>
          ) : debouncedQuery.length > 1 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground">No results found for "{debouncedQuery}"</p>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground/50">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Type to search the global movie database</p>
            </div>
          )}
        </div>
      </div>

      <RatingPickerDialog
        open={!!pendingWatched}
        movieTitle={pendingWatched?.title ?? ""}
        onConfirm={(rating) => {
          const movie = pendingWatched;
          setPendingWatched(null);
          if (movie) doAdd(movie, "watched", rating);
        }}
        onCancel={() => setPendingWatched(null)}
      />
    </Layout>
  );
}
