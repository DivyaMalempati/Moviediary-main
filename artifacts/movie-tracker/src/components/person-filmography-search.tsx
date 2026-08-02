import { useMemo, useState } from "react";
import { TmdbMovieCard } from "@/components/tmdb-movie-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useSearchTmdbPeople,
  getSearchTmdbPeopleQueryKey,
  useGetPersonFilmography,
  getGetPersonFilmographyQueryKey,
  useCreateMovie,
  useListMovies,
  getListMoviesQueryKey,
  type TmdbPerson,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { getPosterUrl } from "@/lib/movie-utils";

type PersonMode = "hero" | "director";

function PersonRow({
  person,
  onSelect,
}: {
  person: TmdbPerson;
  onSelect: () => void;
}) {
  const photo = getPosterUrl(person.profilePath, "w500");
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-foreground/30 transition-colors text-left"
    >
      <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
        {photo ? (
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{person.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {[person.knownForDepartment, ...(person.knownForTitles ?? []).slice(0, 2)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </button>
  );
}

/** Hero / Director search → filmography → add to vault. Used on Discover. */
export function PersonFilmographySearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);
  const [mode, setMode] = useState<PersonMode>("hero");
  const [selectedPerson, setSelectedPerson] = useState<TmdbPerson | null>(null);
  const [pendingWatched, setPendingWatched] = useState<any | null>(null);

  const queryClient = useQueryClient();
  const createMovie = useCreateMovie();
  const { data: library } = useListMovies(undefined, {
    query: { queryKey: getListMoviesQueryKey() },
  });

  const libraryMap = useMemo(() => {
    const m = new Map<number, { status: string }>();
    (library ?? []).forEach((mv) => {
      if (mv.tmdbId != null) m.set(mv.tmdbId, { status: mv.status });
    });
    return m;
  }, [library]);

  const department = mode === "director" ? "Directing" : "Acting";
  const role = mode === "director" ? "crew" : "cast";

  const { data: peopleResults, isLoading: isSearchingPeople } = useSearchTmdbPeople(
    { q: debouncedQuery, department },
    {
      query: {
        enabled: !selectedPerson && debouncedQuery.length > 1,
        queryKey: getSearchTmdbPeopleQueryKey({ q: debouncedQuery, department }),
      },
    },
  );

  const { data: filmography, isLoading: isLoadingFilms } = useGetPersonFilmography(
    { personId: selectedPerson?.tmdbId ?? 0, role },
    {
      query: {
        enabled: !!selectedPerson,
        queryKey: getGetPersonFilmographyQueryKey({
          personId: selectedPerson?.tmdbId ?? 0,
          role,
        }),
      },
    },
  );

  const doAdd = (
    movie: any,
    status: "watched" | "watchlist",
    rating?: string | null,
    watchedAt?: string | null,
  ) => {
    createMovie.mutate(
      {
        data: {
          title: movie.title,
          status,
          ...(rating ? { rating } : {}),
          ...(status === "watched" ? { watchedAt: watchedAt ?? null } : {}),
          ...(movie.tmdbId != null && { tmdbId: movie.tmdbId }),
          ...(movie.posterPath != null && { posterPath: movie.posterPath }),
          ...(movie.releaseYear != null && { releaseYear: movie.releaseYear }),
          ...(movie.releaseDate != null && { releaseDate: movie.releaseDate }),
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
      },
    );
  };

  const changeMode = (next: PersonMode) => {
    setMode(next);
    setSelectedPerson(null);
    setQuery("");
  };

  const isSearching =
    (!selectedPerson && isSearchingPeople) || (!!selectedPerson && isLoadingFilms);

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && changeMode(v as PersonMode)}
        className="justify-start"
      >
        <ToggleGroupItem value="hero" aria-label="Search by hero">
          Hero
        </ToggleGroupItem>
        <ToggleGroupItem value="director" aria-label="Search by director">
          Director
        </ToggleGroupItem>
      </ToggleGroup>

      {selectedPerson ? (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setSelectedPerson(null)}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{selectedPerson.name}</p>
            <p className="text-xs text-muted-foreground">
              {mode === "director" ? "Director filmography" : "Acting filmography"}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder={mode === "director" ? "Search by director…" : "Search by actor / hero…"}
            className="pl-12 h-12 text-base bg-background border-border"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {isSearching && (debouncedQuery.length > 1 || selectedPerson) ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : selectedPerson ? (
        filmography && filmography.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filmography.map((movie) => {
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
                  onAddWatched={() => setPendingWatched(movie)}
                  onAddWatchlist={() => doAdd(movie, "watchlist")}
                  isAddingWatched={isPendingThis && createMovie.variables?.data.status === "watched"}
                  isAddingWatchlist={isPendingThis && createMovie.variables?.data.status === "watchlist"}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-16">
            No films found for {selectedPerson.name}
          </p>
        )
      ) : peopleResults && peopleResults.length > 0 ? (
        <div className="space-y-2">
          {peopleResults.map((person) => (
            <PersonRow
              key={person.tmdbId}
              person={person}
              onSelect={() => setSelectedPerson(person)}
            />
          ))}
        </div>
      ) : debouncedQuery.length > 1 ? (
        <p className="text-center text-muted-foreground py-16">
          No results for “{debouncedQuery}”
        </p>
      ) : (
        <p className="text-center text-muted-foreground/60 py-12 text-sm">
          Find films by Indian (and world) heroes or directors — e.g. Suriya, Mani Ratnam.
        </p>
      )}

      <RatingPickerDialog
        open={!!pendingWatched}
        movieTitle={pendingWatched?.title ?? ""}
        confirmOnSelect
        onConfirm={({ rating, watchedAt }) => {
          const movie = pendingWatched;
          setPendingWatched(null);
          if (movie) doAdd(movie, "watched", rating, watchedAt);
        }}
        onCancel={() => setPendingWatched(null)}
      />
    </div>
  );
}
