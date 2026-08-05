import { useEffect, useMemo, useState } from "react";
import { TmdbMovieCard } from "@/components/tmdb-movie-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useSearchTmdb,
  getSearchTmdbQueryKey,
  useSearchTmdbPeople,
  getSearchTmdbPeopleQueryKey,
  useGetPersonFilmography,
  getGetPersonFilmographyQueryKey,
  useGetSimilarMovies,
  getGetSimilarMoviesQueryKey,
  useGetTmdbRecommendations,
  getGetTmdbRecommendationsQueryKey,
  useCreateMovie,
  useListMovies,
  getListMoviesQueryKey,
  type TmdbPerson,
  type TmdbMovie,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { getPosterUrl } from "@/lib/movie-utils";
import { buildDiaryNote } from "@/lib/diary-notes";
import { authFetch } from "@/lib/demo-auth";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SearchMode = "person" | "film" | "like" | "vibe";
type PersonRole = "actor" | "director";

const VIBES = [
  { slug: "treasure-hunt", label: "Treasure Hunt" },
  { slug: "heist", label: "Heist" },
  { slug: "serial-killer", label: "Serial Killer" },
  { slug: "twist-ending", label: "Twist Ending" },
  { slug: "forensic-investigation", label: "Forensic" },
  { slug: "investigative-thriller", label: "Investigative" },
  { slug: "crime-thriller", label: "Crime Thriller" },
  { slug: "suspense", label: "Suspense" },
] as const;

type VibeSlug = (typeof VIBES)[number]["slug"];

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

function MovieSeedRow({
  movie,
  onSelect,
}: {
  movie: TmdbMovie;
  onSelect: () => void;
}) {
  const poster = getPosterUrl(movie.posterPath, "w185");
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-foreground/30 transition-colors text-left"
    >
      <div className="w-10 h-14 rounded-md overflow-hidden bg-secondary shrink-0">
        {poster ? <img src={poster} alt="" className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{movie.title}</p>
        <p className="text-xs text-muted-foreground">
          {[movie.releaseYear, movie.originalLanguage].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">More like this</span>
    </button>
  );
}

/** Discover → Search: Actor/Director, Film title, Like this, Vibe. */
export function DiscoverSearch() {
  const [mode, setMode] = useState<SearchMode>("person");
  const [personRole, setPersonRole] = useState<PersonRole>("actor");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);
  const [selectedPerson, setSelectedPerson] = useState<TmdbPerson | null>(null);
  const [likeSeed, setLikeSeed] = useState<TmdbMovie | null>(null);
  const [vibe, setVibe] = useState<VibeSlug | null>(null);
  const [vibeFilms, setVibeFilms] = useState<TmdbMovie[]>([]);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [pendingWatched, setPendingWatched] = useState<TmdbMovie | null>(null);

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

  const department = personRole === "director" ? "Directing" : "Acting";
  const role = personRole === "director" ? "crew" : "cast";

  const { data: peopleResults, isLoading: isSearchingPeople } = useSearchTmdbPeople(
    { q: debouncedQuery, department },
    {
      query: {
        enabled: mode === "person" && !selectedPerson && debouncedQuery.length > 1,
        queryKey: getSearchTmdbPeopleQueryKey({ q: debouncedQuery, department }),
      },
    },
  );

  const { data: filmography, isLoading: isLoadingFilms } = useGetPersonFilmography(
    { personId: selectedPerson?.tmdbId ?? 0, role },
    {
      query: {
        enabled: mode === "person" && !!selectedPerson,
        queryKey: getGetPersonFilmographyQueryKey({
          personId: selectedPerson?.tmdbId ?? 0,
          role,
        }),
      },
    },
  );

  const filmSearchEnabled =
    (mode === "film" || (mode === "like" && !likeSeed)) && debouncedQuery.length > 1;

  const { data: filmResults, isLoading: isSearchingFilms } = useSearchTmdb(
    { q: debouncedQuery, region: "IN" },
    {
      query: {
        enabled: filmSearchEnabled,
        queryKey: getSearchTmdbQueryKey({ q: debouncedQuery, region: "IN" }),
      },
    },
  );

  const { data: similar, isLoading: isLoadingSimilar } = useGetSimilarMovies(
    likeSeed?.tmdbId ?? 0,
    {
      query: {
        enabled: mode === "like" && !!likeSeed,
        queryKey: getGetSimilarMoviesQueryKey(likeSeed?.tmdbId ?? 0),
      },
    },
  );

  const { data: recommendations, isLoading: isLoadingRecs } = useGetTmdbRecommendations(
    likeSeed?.tmdbId ?? 0,
    {
      query: {
        enabled: mode === "like" && !!likeSeed,
        queryKey: getGetTmdbRecommendationsQueryKey(likeSeed?.tmdbId ?? 0),
      },
    },
  );

  const likeResults = useMemo(() => {
    const seen = new Set<number>();
    const out: TmdbMovie[] = [];
    for (const m of [...(similar ?? []), ...(recommendations ?? [])]) {
      if (seen.has(m.tmdbId) || m.tmdbId === likeSeed?.tmdbId) continue;
      seen.add(m.tmdbId);
      out.push(m);
    }
    return out;
  }, [similar, recommendations, likeSeed?.tmdbId]);

  useEffect(() => {
    if (mode !== "vibe" || !vibe) {
      setVibeFilms([]);
      return;
    }
    let cancelled = false;
    setVibeLoading(true);
    (async () => {
      try {
        const res = await authFetch(
          `${BASE}/api/tmdb/trope-movies?trope=${encodeURIComponent(vibe)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TmdbMovie[];
        if (!cancelled) setVibeFilms(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setVibeFilms([]);
          toast.error("Couldn’t load that vibe right now");
        }
      } finally {
        if (!cancelled) setVibeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, vibe]);

  const changeMode = (next: SearchMode) => {
    setMode(next);
    setQuery("");
    setSelectedPerson(null);
    setLikeSeed(null);
    setVibe(null);
    setVibeFilms([]);
  };

  const doAdd = (
    movie: TmdbMovie,
    status: "watched" | "watchlist",
    rating?: string | null,
    watchedAt?: string | null,
    notes?: string | null,
  ) => {
    const notesPayload =
      notes != null && notes.trim().length > 0 ? { notes: notes.trim() } : {};
    createMovie.mutate(
      {
        data: {
          title: movie.title,
          status,
          ...(rating ? { rating } : {}),
          ...(status === "watched" ? { watchedAt: watchedAt ?? null } : {}),
          ...notesPayload,
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

  const renderMovieGrid = (movies: TmdbMovie[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {movies.map((movie) => {
        const lib = libraryMap.get(movie.tmdbId);
        const isPendingThis =
          createMovie.isPending && createMovie.variables?.data.tmdbId === movie.tmdbId;
        return (
          <TmdbMovieCard
            key={movie.tmdbId}
            {...movie}
            inLibrary={!!lib}
            libraryStatus={lib?.status as "watched" | "watchlist" | undefined}
            onAddWatched={() => setPendingWatched(movie)}
            onAddWatchlist={() => doAdd(movie, "watchlist")}
            isAddingWatched={
              !!isPendingThis && createMovie.variables?.data.status === "watched"
            }
            isAddingWatchlist={
              !!isPendingThis && createMovie.variables?.data.status === "watchlist"
            }
          />
        );
      })}
    </div>
  );

  const modeBtn = (id: SearchMode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => changeMode(id)}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors",
        mode === id
          ? "bg-foreground text-background border-foreground"
          : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/40",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4" data-tour="add-actor-search">
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
        {modeBtn("person", "Actor")}
        {modeBtn("film", "Film")}
        {modeBtn("like", "Like this")}
        {modeBtn("vibe", "Vibe")}
      </div>

      {mode === "person" && (
        <ToggleGroup
          type="single"
          value={personRole}
          onValueChange={(v) => {
            if (!v) return;
            setPersonRole(v as PersonRole);
            setSelectedPerson(null);
            setQuery("");
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="actor" aria-label="Search by actor">
            Actor
          </ToggleGroupItem>
          <ToggleGroupItem value="director" aria-label="Search by director">
            Director
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {mode === "person" && selectedPerson ? (
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
              {personRole === "director" ? "Director filmography" : "Acting filmography"}
            </p>
          </div>
        </div>
      ) : mode === "like" && likeSeed ? (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setLikeSeed(null)}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">More like {likeSeed.title}</p>
            <p className="text-xs text-muted-foreground">Similar & recommended</p>
          </div>
        </div>
      ) : mode === "vibe" ? (
        <div className="flex flex-wrap gap-2">
          {VIBES.map((v) => (
            <button
              key={v.slug}
              type="button"
              onClick={() => setVibe(v.slug)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium border transition-colors",
                vibe === v.slug
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder={
              mode === "film"
                ? "Search film titles… e.g. Romancham"
                : mode === "like"
                  ? "Find a film to start from… e.g. Romancham"
                  : personRole === "director"
                    ? "Search by director…"
                    : "Search actors — hero, heroine, comedian…"
            }
            className="pl-12 h-12 text-base bg-background border-border"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {/* Results */}
      {mode === "person" &&
        (selectedPerson ? (
          isLoadingFilms ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filmography && filmography.length > 0 ? (
            renderMovieGrid(filmography)
          ) : (
            <p className="text-center text-muted-foreground py-16">
              No films found for {selectedPerson.name}
            </p>
          )
        ) : isSearchingPeople && debouncedQuery.length > 1 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
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
            Search any actor or director — e.g. Samantha, Vadivelu, Mani Ratnam.
          </p>
        ))}

      {mode === "film" &&
        (isSearchingFilms && debouncedQuery.length > 1 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filmResults && filmResults.length > 0 ? (
          renderMovieGrid(filmResults)
        ) : debouncedQuery.length > 1 ? (
          <p className="text-center text-muted-foreground py-16">
            No films for “{debouncedQuery}”
          </p>
        ) : (
          <p className="text-center text-muted-foreground/60 py-12 text-sm">
            Search a title to log or save — e.g. Romancham, Super Deluxe.
          </p>
        ))}

      {mode === "like" &&
        (likeSeed ? (
          isLoadingSimilar || isLoadingRecs ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : likeResults.length > 0 ? (
            renderMovieGrid(likeResults)
          ) : (
            <p className="text-center text-muted-foreground py-16">
              No similar films found for {likeSeed.title}
            </p>
          )
        ) : isSearchingFilms && debouncedQuery.length > 1 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filmResults && filmResults.length > 0 ? (
          <div className="space-y-2">
            {filmResults.map((movie) => (
              <MovieSeedRow
                key={movie.tmdbId}
                movie={movie}
                onSelect={() => setLikeSeed(movie)}
              />
            ))}
          </div>
        ) : debouncedQuery.length > 1 ? (
          <p className="text-center text-muted-foreground py-16">
            No films for “{debouncedQuery}”
          </p>
        ) : (
          <p className="text-center text-muted-foreground/60 py-12 text-sm">
            Pick a film you loved — we’ll show similar picks. e.g. Romancham.
          </p>
        ))}

      {mode === "vibe" &&
        (vibeLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : vibe ? (
          vibeFilms.length > 0 ? (
            renderMovieGrid(vibeFilms)
          ) : (
            <p className="text-center text-muted-foreground py-16">
              No films for that vibe right now — try another.
            </p>
          )
        ) : (
          <p className="text-center text-muted-foreground/60 py-12 text-sm">
            Pick a vibe — treasure hunts, heists, twist endings, and more.
          </p>
        ))}

      <RatingPickerDialog
        open={!!pendingWatched}
        movieTitle={pendingWatched?.title ?? ""}
        confirmOnSelect
        showDiaryBlanks
        onConfirm={({ rating, watchedAt, withWho, felt }) => {
          const movie = pendingWatched;
          setPendingWatched(null);
          if (!movie) return;
          const notes = buildDiaryNote({ withWho, felt });
          doAdd(movie, "watched", rating, watchedAt, notes || null);
        }}
        onCancel={() => setPendingWatched(null)}
      />
    </div>
  );
}
