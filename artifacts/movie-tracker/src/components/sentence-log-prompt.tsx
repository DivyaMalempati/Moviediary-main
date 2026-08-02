import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TmdbMovieCard } from "@/components/tmdb-movie-card";
import {
  useSearchTmdb,
  getSearchTmdbQueryKey,
  useCreateMovie,
  useUpdateMovie,
  useListMovies,
  getListMoviesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildDiaryNote } from "@/lib/diary-notes";
import { todayInputValue } from "@/lib/movie-utils";

type WhenChoice = "today" | "earlier" | "unknown";

/**
 * Fill-in-the-blank diary prompt:
 * “Watched ___ ___ with ___ and ___”
 */
export function SentenceLogPrompt() {
  const [film, setFilm] = useState("");
  const [when, setWhen] = useState<WhenChoice>("today");
  const [earlierDate, setEarlierDate] = useState(todayInputValue);
  const [withWho, setWithWho] = useState("");
  const [felt, setFelt] = useState("");
  const [searching, setSearching] = useState(false);

  const debouncedFilm = useDebounce(film.trim(), 400);
  const queryEnabled = searching && debouncedFilm.length > 1;

  const queryClient = useQueryClient();
  const createMovie = useCreateMovie();
  const updateMovie = useUpdateMovie();
  const { data: library } = useListMovies(undefined, {
    query: { queryKey: getListMoviesQueryKey() },
  });

  const libraryMap = useMemo(() => {
    const m = new Map<number, { id: number; status: string }>();
    (library ?? []).forEach((mv) => {
      if (mv.tmdbId != null) m.set(mv.tmdbId, { id: mv.id, status: mv.status });
    });
    return m;
  }, [library]);

  const { data: results, isLoading } = useSearchTmdb(
    { q: debouncedFilm, region: "IN" },
    {
      query: {
        enabled: queryEnabled,
        queryKey: getSearchTmdbQueryKey({ q: debouncedFilm, region: "IN" }),
      },
    },
  );

  const previewSentence = useMemo(() => {
    const title = film.trim() || "______";
    const whenWord =
      when === "today" ? "today" : when === "earlier" ? "earlier" : "…";
    const who = withWho.trim() || "______";
    const note = felt.trim() || "______";
    return `Watched ${title} ${whenWord} with ${who} and ${note}`;
  }, [film, when, withWho, felt]);

  const resolveWatchedAt = (): string | null => {
    if (when === "today") return todayInputValue();
    if (when === "earlier") return earlierDate || todayInputValue();
    return null;
  };

  const afterLogged = (title: string) => {
    toast.success(`Logged “${title}” in your diary`);
    queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
    queryClient.invalidateQueries({ queryKey: ["/api/movies/stats"] });
    setFilm("");
    setWithWho("");
    setFelt("");
    setWhen("today");
    setSearching(false);
  };

  const logFilm = (movie: {
    title: string;
    tmdbId?: number | null;
    posterPath?: string | null;
    releaseYear?: number | null;
    releaseDate?: string | null;
    originalLanguage?: string | null;
    genres?: string[] | null;
    overview?: string | null;
  }) => {
    const notes = buildDiaryNote({ withWho, felt });
    const watchedAt = resolveWatchedAt();
    const existing =
      movie.tmdbId != null ? libraryMap.get(movie.tmdbId) : undefined;

    if (existing?.status === "watched") {
      toast.info(`“${movie.title}” is already in Watched`);
      return;
    }

    // Watchlist → Watched (move + attach diary note)
    if (existing?.status === "watchlist") {
      updateMovie.mutate(
        {
          id: existing.id,
          data: {
            status: "watched",
            notes,
            watchedAt,
          },
        },
        {
          onSuccess: () => afterLogged(movie.title),
          onError: () => toast.error(`Couldn't log “${movie.title}”`),
        },
      );
      return;
    }

    createMovie.mutate(
      {
        data: {
          title: movie.title,
          status: "watched",
          notes,
          watchedAt,
          ...(movie.tmdbId != null && { tmdbId: movie.tmdbId }),
          ...(movie.posterPath != null && { posterPath: movie.posterPath }),
          ...(movie.releaseYear != null && { releaseYear: movie.releaseYear }),
          ...(movie.releaseDate != null && { releaseDate: movie.releaseDate }),
          ...(movie.originalLanguage != null && {
            originalLanguage: movie.originalLanguage,
          }),
          ...(movie.genres != null && { genres: movie.genres }),
          ...(movie.overview != null && { overview: movie.overview }),
        },
      },
      {
        onSuccess: () => afterLogged(movie.title),
        onError: (err: any) => {
          if (err?.response?.status === 409 || err?.status === 409) {
            toast.info(`“${movie.title}” is already in your library`);
            queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          } else {
            toast.error(`Couldn't log “${movie.title}”`);
          }
        },
      },
    );
  };

  const blankClass =
    "inline-flex min-w-[7rem] max-w-full align-baseline mx-0.5 border-b border-dashed border-foreground/40 bg-transparent px-1 py-0.5 text-base font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6 space-y-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Diary prompt
          </p>
          <p className="text-sm text-muted-foreground">
            Fill the blanks — then pick the matching film. Your words stay private in your diary.
          </p>
        </div>

        <div className="text-lg md:text-xl leading-relaxed font-medium text-foreground/90 space-y-3">
          <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2">
            <span>Watched</span>
            <input
              value={film}
              onChange={(e) => {
                setFilm(e.target.value);
                setSearching(false);
              }}
              placeholder="film title"
              className={cn(blankClass, "min-w-[10rem] flex-1")}
              aria-label="Film title"
            />
            <span
              className={cn(
                "inline-flex rounded-lg border px-2.5 py-1 text-sm font-medium cursor-pointer transition-colors",
                when === "today"
                  ? "border-primary bg-primary/15"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setWhen("today")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setWhen("today");
              }}
            >
              today
            </span>
            <span
              className={cn(
                "inline-flex rounded-lg border px-2.5 py-1 text-sm font-medium cursor-pointer transition-colors",
                when === "earlier"
                  ? "border-primary bg-primary/15"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setWhen("earlier")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setWhen("earlier");
              }}
            >
              earlier
            </span>
            <span
              className={cn(
                "inline-flex rounded-lg border px-2.5 py-1 text-sm font-medium cursor-pointer transition-colors",
                when === "unknown"
                  ? "border-primary bg-primary/15"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setWhen("unknown")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setWhen("unknown");
              }}
            >
              not sure when
            </span>
          </p>

          {when === "earlier" && (
            <Input
              type="date"
              value={earlierDate}
              max={todayInputValue()}
              onChange={(e) => setEarlierDate(e.target.value)}
              className="max-w-[14rem] bg-background"
            />
          )}

          <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2">
            <span>with</span>
            <input
              value={withWho}
              onChange={(e) => setWithWho(e.target.value)}
              placeholder="friends / alone / …"
              className={cn(blankClass, "min-w-[9rem] flex-1")}
              aria-label="Who you watched with"
            />
          </p>

          <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2">
            <span>and</span>
            <input
              value={felt}
              onChange={(e) => setFelt(e.target.value)}
              placeholder="I liked how it was made…"
              className={cn(blankClass, "min-w-[12rem] flex-[2]")}
              aria-label="How it felt"
            />
          </p>
        </div>

        <p className="text-xs text-muted-foreground italic border-t border-border/60 pt-3">
          Preview: {previewSentence}
        </p>

        <Button
          className="w-full sm:w-auto"
          disabled={film.trim().length < 2}
          onClick={() => setSearching(true)}
        >
          <Search className="w-4 h-4 mr-2" />
          Find film &amp; log
        </Button>
      </div>

      {searching && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Pick the right film</h2>
          {isLoading || (queryEnabled && !results) ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : results && results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.slice(0, 8).map((movie) => {
                const lib = libraryMap.get(movie.tmdbId);
                const pendingCreate =
                  createMovie.isPending &&
                  createMovie.variables?.data.tmdbId === movie.tmdbId;
                const pendingUpdate =
                  updateMovie.isPending &&
                  lib != null &&
                  updateMovie.variables?.id === lib.id;
                return (
                  <TmdbMovieCard
                    key={movie.tmdbId}
                    {...movie}
                    inLibrary={!!lib}
                    libraryStatus={lib?.status as "watched" | "watchlist" | undefined}
                    onAddWatched={() => logFilm(movie)}
                    onAddWatchlist={() => {
                      toast.message("Sentence log saves as Watched", {
                        description: "Use title search below for Watchlist.",
                      });
                    }}
                    isAddingWatched={!!pendingCreate || !!pendingUpdate}
                    isAddingWatchlist={false}
                  />
                );
              })}
            </div>
          ) : debouncedFilm.length > 1 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              No matches for “{debouncedFilm}”. Try another title spelling.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
