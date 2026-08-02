import { useState, useMemo, useEffect } from "react";
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
  useCreateMovie,
  useMatchAllMovies,
  useListMovies,
  getListMoviesQueryKey,
  type TmdbPerson,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Globe, MapPin, Loader2, Sparkles, Tv, ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { usePreferences } from "@/lib/preferences";
import { getAuthHeaders } from "@/lib/demo-auth";
import { getPosterUrl } from "@/lib/movie-utils";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SearchMode = "title" | "hero" | "director";

async function isOnMyServices(
  tmdbId: number,
  providerIds: number[],
  watchRegion: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE}/api/tmdb/watch-providers/${tmdbId}?watchRegion=${encodeURIComponent(watchRegion)}`,
      { credentials: "include", headers: await getAuthHeaders() },
    );
    if (!res.ok) return false;
    const data = await res.json() as {
      flatrate?: Array<{ providerId?: number; name?: string }> | null;
    };
    const flatrate = data.flatrate ?? [];
    const wanted = new Set(providerIds);
    return flatrate.some((p) => p.providerId != null && wanted.has(p.providerId));
  } catch {
    return false;
  }
}

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

export default function AddPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);
  const [searchMode, setSearchMode] = useState<SearchMode>("title");
  const [region, setRegion] = useState("IN");
  const [selectedPerson, setSelectedPerson] = useState<TmdbPerson | null>(null);
  const [pendingWatched, setPendingWatched] = useState<any | null>(null);
  const [onMyServices, setOnMyServices] = useState(false);
  const [streamingIds, setStreamingIds] = useState<Set<number> | null>(null);
  const [filteringStreaming, setFilteringStreaming] = useState(false);

  const { data: prefs } = usePreferences();
  const preferredProviders = prefs?.preferredProviders ?? [];
  const watchRegion = prefs?.watchRegion ?? "IN";

  const queryClient = useQueryClient();
  const createMovie = useCreateMovie();
  const matchAll = useMatchAllMovies();

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

  const isTitleMode = searchMode === "title";
  const personDepartment = searchMode === "director" ? "Directing" : "Acting";
  const personRole = searchMode === "director" ? "crew" : "cast";

  const { data: titleResults, isLoading: isSearchingTitles } = useSearchTmdb(
    { q: debouncedQuery, region: region === "IN" ? "IN" : undefined },
    {
      query: {
        enabled: isTitleMode && !selectedPerson && debouncedQuery.length > 1,
        queryKey: getSearchTmdbQueryKey({
          q: debouncedQuery,
          region: region === "IN" ? "IN" : undefined,
        }),
      },
    },
  );

  // Also run people search in Title mode so names like "Suriya" surface the
  // actor (TMDB movie search only matches titles, not cast).
  const { data: peopleResults, isLoading: isSearchingPeople } = useSearchTmdbPeople(
    { q: debouncedQuery, department: personDepartment },
    {
      query: {
        enabled: !selectedPerson && debouncedQuery.length > 1,
        queryKey: getSearchTmdbPeopleQueryKey({
          q: debouncedQuery,
          department: personDepartment,
        }),
      },
    },
  );

  const peoplePreview = useMemo(() => {
    if (!peopleResults?.length) return [];
    const q = debouncedQuery.trim().toLowerCase();
    // In Title mode, only show people when the query looks like a name match.
    if (isTitleMode) {
      return peopleResults
        .filter((p) => {
          const n = p.name.toLowerCase();
          return n === q || n.startsWith(q) || n.split(/\s+/).some((part) => part === q);
        })
        .slice(0, 5);
    }
    return peopleResults;
  }, [peopleResults, debouncedQuery, isTitleMode]);

  const { data: filmography, isLoading: isLoadingFilms } = useGetPersonFilmography(
    { personId: selectedPerson?.tmdbId ?? 0, role: personRole },
    {
      query: {
        enabled: !!selectedPerson,
        queryKey: getGetPersonFilmographyQueryKey({
          personId: selectedPerson?.tmdbId ?? 0,
          role: personRole,
        }),
      },
    },
  );

  const movieResults = selectedPerson ? filmography : titleResults;

  useEffect(() => {
    let cancelled = false;
    setStreamingIds(null);

    if (!onMyServices || !movieResults?.length || preferredProviders.length === 0) {
      setFilteringStreaming(false);
      return;
    }

    setFilteringStreaming(true);
    (async () => {
      const matched = new Set<number>();
      const chunkSize = 4;
      for (let i = 0; i < movieResults.length; i += chunkSize) {
        const chunk = movieResults.slice(i, i + chunkSize);
        const checks = await Promise.all(
          chunk.map(async (movie) => {
            const ok = await isOnMyServices(movie.tmdbId, preferredProviders, watchRegion);
            return ok ? movie.tmdbId : null;
          }),
        );
        if (cancelled) return;
        for (const id of checks) if (id != null) matched.add(id);
      }
      if (!cancelled) {
        setStreamingIds(matched);
        setFilteringStreaming(false);
      }
    })();

    return () => { cancelled = true; };
  }, [onMyServices, movieResults, preferredProviders, watchRegion]);

  const visibleResults = useMemo(() => {
    if (!movieResults) return movieResults;
    if (!onMyServices) return movieResults;
    if (preferredProviders.length === 0) return movieResults;
    if (!streamingIds) return [];
    return movieResults.filter((m) => streamingIds.has(m.tmdbId));
  }, [movieResults, onMyServices, preferredProviders, streamingIds]);

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

  const toggleOnMyServices = () => {
    if (!onMyServices && preferredProviders.length === 0) {
      toast.message("Pick your streaming services in Preferences first", {
        description: "Profile → Streaming services, then try again.",
        action: {
          label: "Open profile",
          onClick: () => { window.location.href = `${BASE}/profile`; },
        },
      });
      return;
    }
    setOnMyServices((v) => !v);
  };

  const changeMode = (mode: SearchMode) => {
    setSearchMode(mode);
    setSelectedPerson(null);
    setQuery("");
  };

  const placeholder =
    searchMode === "hero"
      ? "Search by actor / hero…"
      : searchMode === "director"
        ? "Search by director…"
        : "Search by title…";

  const isSearching =
    (isTitleMode && isSearchingTitles && !peoplePreview.length) ||
    (!selectedPerson && isSearchingPeople && !isTitleMode) ||
    (!!selectedPerson && isLoadingFilms) ||
    filteringStreaming;

  return (
    <>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <section className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Search</h1>
          <p className="text-muted-foreground">
            Find films by title, hero, or director to add to your vault.
          </p>
        </section>

        <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm sticky top-0 z-20 space-y-4">
          <ToggleGroup
            type="single"
            value={searchMode}
            onValueChange={(v) => v && changeMode(v as SearchMode)}
            className="justify-start flex-wrap"
          >
            <ToggleGroupItem value="title" aria-label="Search by title">
              Title
            </ToggleGroupItem>
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
                  {searchMode === "director" ? "Director filmography" : "Acting filmography"}
                </p>
              </div>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder={placeholder}
                className="pl-12 h-14 text-lg bg-background border-border shadow-inner"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {isTitleMode && (
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
              )}

              {(isTitleMode || selectedPerson) && (
                <button
                  type="button"
                  onClick={toggleOnMyServices}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    onMyServices
                      ? "bg-emerald-400 text-black border-emerald-400"
                      : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  <Tv className="w-3.5 h-3.5" />
                  Available on my streaming services
                </button>
              )}
            </div>

            {isTitleMode && (
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
            )}
          </div>

          {onMyServices && preferredProviders.length > 0 && (isTitleMode || selectedPerson) && (
            <p className="text-[11px] text-muted-foreground">
              Showing titles with flatrate availability in {watchRegion} on your selected services.
              {filteringStreaming ? " Checking…" : ""}
            </p>
          )}
        </div>

        <div className="space-y-4 pb-20">
          {isSearching && (debouncedQuery.length > 1 || selectedPerson) ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : selectedPerson ? (
            visibleResults && visibleResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleResults.map((movie) => {
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
            ) : (
              <div className="text-center py-20 space-y-2">
                <p className="text-muted-foreground">
                  No films found for {selectedPerson.name}
                </p>
              </div>
            )
          ) : !isTitleMode && peoplePreview.length > 0 ? (
            <div className="space-y-2">
              {peoplePreview.map((person) => (
                <PersonRow
                  key={person.tmdbId}
                  person={person}
                  onSelect={() => {
                    setSearchMode(person.knownForDepartment === "Directing" ? "director" : "hero");
                    setSelectedPerson(person);
                  }}
                />
              ))}
            </div>
          ) : isTitleMode && (peoplePreview.length > 0 || (visibleResults && visibleResults.length > 0)) ? (
            <div className="space-y-6">
              {peoplePreview.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">People</p>
                  {peoplePreview.map((person) => (
                    <PersonRow
                      key={person.tmdbId}
                      person={person}
                      onSelect={() => {
                        setSearchMode(
                          person.knownForDepartment === "Directing" ? "director" : "hero",
                        );
                        setSelectedPerson(person);
                      }}
                    />
                  ))}
                </div>
              )}
              {visibleResults && visibleResults.length > 0 && (
                <div className="space-y-2">
                  {peoplePreview.length > 0 && (
                    <p className="text-sm font-medium text-muted-foreground">Titles</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleResults.map((movie) => {
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
                </div>
              )}
            </div>
          ) : debouncedQuery.length > 1 ? (
            <div className="text-center py-20 space-y-2">
              <p className="text-muted-foreground">
                {onMyServices && isTitleMode
                  ? `No results for "${debouncedQuery}" on your streaming services`
                  : `No results found for "${debouncedQuery}"`}
              </p>
              {onMyServices && isTitleMode && (
                <p className="text-xs text-muted-foreground">
                  Try turning off the streaming filter, or{" "}
                  <Link href="/profile" className="underline underline-offset-2 hover:text-foreground">
                    update your services
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground/50">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>
                {searchMode === "hero"
                  ? "Type a hero or actor name"
                  : searchMode === "director"
                    ? "Type a director name"
                    : "Type to search the global movie database"}
              </p>
            </div>
          )}
        </div>
      </div>

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
    </>
  );
}
