import { useState, useMemo, useEffect, useCallback } from "react";
import { TmdbMovieCard } from "@/components/tmdb-movie-card";
import { SentenceLogPrompt } from "@/components/sentence-log-prompt";
import { DiscoverPanels } from "@/components/discover-content";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useSearchTmdb,
  getSearchTmdbQueryKey,
  useCreateMovie,
  useUpdateMovie,
  useMatchAllMovies,
  useListMovies,
  getListMoviesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Globe,
  MapPin,
  Loader2,
  Sparkles,
  Tv,
  UserRound,
  MessageCircleHeart,
  ThumbsUp,
  TrendingUp,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { usePreferences } from "@/lib/preferences";
import { useSessionSettings } from "@/hooks/use-session-settings";
import { getAuthHeaders } from "@/lib/demo-auth";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { isFeatureEnabled } from "@/lib/features";
import {
  type AddTabId,
  addTabHref,
  parseAddTab,
  readAddTabFromWindow,
} from "@/lib/add-tabs";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

function useAddTab(): [AddTabId, (tab: AddTabId) => void] {
  const [location, setLocation] = useLocation();
  const [tab, setTabState] = useState<AddTabId>(() => readAddTabFromWindow());

  // Sync when nav Links or back/forward change the URL (incl. ?tab=).
  useEffect(() => {
    setTabState(readAddTabFromWindow());
  }, [location]);

  useEffect(() => {
    const sync = () => setTabState(readAddTabFromWindow());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const setTab = useCallback(
    (next: AddTabId) => {
      setTabState(next);
      setLocation(addTabHref(next));
    },
    [setLocation],
  );

  return [tab, setTab];
}

export default function AddPage() {
  const discoverEnabled = isFeatureEnabled("discover");
  const [activeTab, setActiveTab] = useAddTab();

  // If Discover is gated off, stay on Log.
  useEffect(() => {
    if (!discoverEnabled && activeTab !== "log") setActiveTab("log");
  }, [discoverEnabled, activeTab, setActiveTab]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);
  const [region, setRegion] = useState("IN");
  const [pendingWatched, setPendingWatched] = useState<any | null>(null);
  const [onMyServices, setOnMyServices] = useState(false);
  const [streamingIds, setStreamingIds] = useState<Set<number> | null>(null);
  const [filteringStreaming, setFilteringStreaming] = useState(false);
  const [showTitleSearch, setShowTitleSearch] = useState(false);

  const { sentenceLog } = useSessionSettings();
  const { data: prefs } = usePreferences();
  const preferredProviders = prefs?.preferredProviders ?? [];
  const watchRegion = prefs?.watchRegion ?? "IN";

  const queryClient = useQueryClient();
  const createMovie = useCreateMovie();
  const updateMovie = useUpdateMovie();
  const matchAll = useMatchAllMovies();

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

  const { data: results, isLoading: isSearching } = useSearchTmdb(
    { q: debouncedQuery, region: region === "IN" ? "IN" : undefined },
    {
      query: {
        enabled: activeTab === "log" && debouncedQuery.length > 1,
        queryKey: getSearchTmdbQueryKey({
          q: debouncedQuery,
          region: region === "IN" ? "IN" : undefined,
        }),
      },
    },
  );

  useEffect(() => {
    let cancelled = false;
    setStreamingIds(null);

    if (!onMyServices || !results?.length || preferredProviders.length === 0) {
      setFilteringStreaming(false);
      return;
    }

    setFilteringStreaming(true);
    (async () => {
      const matched = new Set<number>();
      const chunkSize = 4;
      for (let i = 0; i < results.length; i += chunkSize) {
        const chunk = results.slice(i, i + chunkSize);
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
  }, [onMyServices, results, preferredProviders, watchRegion]);

  const visibleResults = useMemo(() => {
    if (!results) return results;
    if (!onMyServices) return results;
    if (preferredProviders.length === 0) return results;
    if (!streamingIds) return [];
    return results.filter((m) => streamingIds.has(m.tmdbId));
  }, [results, onMyServices, preferredProviders, streamingIds]);

  const doAdd = (
    movie: any,
    status: "watched" | "watchlist",
    rating?: string | null,
    watchedAt?: string | null,
  ) => {
    const existing =
      movie.tmdbId != null ? libraryMap.get(movie.tmdbId) : undefined;

    if (status === "watched" && existing?.status === "watchlist") {
      updateMovie.mutate(
        {
          id: existing.id,
          data: {
            status: "watched",
            ...(rating ? { rating } : {}),
            watchedAt: watchedAt ?? null,
          },
        },
        {
          onSuccess: () => {
            toast.success(`Moved "${movie.title}" to Watched`);
            queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
            queryClient.invalidateQueries({ queryKey: ["/api/movies/stats"] });
          },
          onError: () => toast.error(`Failed to update "${movie.title}"`),
        },
      );
      return;
    }

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

  const onTabChange = (value: string) => {
    const next = parseAddTab(value);
    if (!discoverEnabled && next !== "log") return;
    setActiveTab(next);
  };

  const tabTriggerClass =
    "rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all text-xs sm:text-sm px-2 sm:px-3";

  return (
    <>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <section className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">Add</h1>
          <p className="text-muted-foreground">
            {activeTab === "log"
              ? sentenceLog
                ? "Log what you watched with a short diary prompt — or search by title below."
                : "Search by title to log a film, or switch tabs to browse Discover."
              : "Browse by hero or director, or get picks tuned to your taste — then log from the poster."}
          </p>
          {sentenceLog && activeTab === "log" && (
            <p className="text-xs text-muted-foreground">
              Sentence log is on for this session. Turn it off anytime in{" "}
              <Link href="/profile" className="text-primary underline underline-offset-2">
                Profile → Session settings
              </Link>
              .
            </p>
          )}
        </section>

        <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
          <TabsList
            className={cn(
              "grid w-full bg-secondary p-1 rounded-xl h-auto min-h-12 gap-1",
              discoverEnabled ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-1",
            )}
          >
            <TabsTrigger value="log" className={tabTriggerClass}>
              <PlusCircle className="w-4 h-4 mr-1.5 shrink-0" />
              Log
            </TabsTrigger>
            {discoverEnabled && (
              <>
                <TabsTrigger value="people" className={tabTriggerClass}>
                  <UserRound className="w-4 h-4 mr-1.5 shrink-0" />
                  <span className="truncate">Hero / Director</span>
                </TabsTrigger>
                <TabsTrigger value="foryou" className={tabTriggerClass}>
                  <MessageCircleHeart className="w-4 h-4 mr-1.5 shrink-0" />
                  For You
                </TabsTrigger>
                <TabsTrigger value="liked" className={tabTriggerClass}>
                  <ThumbsUp className="w-4 h-4 mr-1.5 shrink-0" />
                  Liked
                </TabsTrigger>
                <TabsTrigger value="trending" className={tabTriggerClass}>
                  <TrendingUp className="w-4 h-4 mr-1.5 shrink-0" />
                  Trending
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="log" className="mt-6 space-y-6">
            {sentenceLog && <SentenceLogPrompt />}

            {sentenceLog && (
              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-sm font-medium">Title search</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowTitleSearch((v) => !v)}
                >
                  {showTitleSearch ? "Hide" : "Show title search"}
                </Button>
              </div>
            )}

            {(!sentenceLog || showTitleSearch) && (
              <>
                <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm sticky top-0 z-20 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      placeholder="Search by title…"
                      className="pl-12 h-14 text-lg bg-background border-border shadow-inner"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>

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
                  {(isSearching || filteringStreaming) && debouncedQuery.length > 1 ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : visibleResults && visibleResults.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {visibleResults.map((movie) => {
                        const lib = libraryMap.get(movie.tmdbId);
                        const isPendingCreate =
                          createMovie.isPending &&
                          createMovie.variables?.data.tmdbId === movie.tmdbId;
                        const isPendingUpdate =
                          updateMovie.isPending &&
                          lib != null &&
                          updateMovie.variables?.id === lib.id;
                        return (
                          <TmdbMovieCard
                            key={movie.tmdbId}
                            {...movie}
                            inLibrary={!!lib}
                            libraryStatus={lib?.status as "watched" | "watchlist" | undefined}
                            onAddWatched={() => handleAdd(movie, "watched")}
                            onAddWatchlist={() => handleAdd(movie, "watchlist")}
                            isAddingWatched={
                              (!!isPendingCreate && createMovie.variables?.data.status === "watched") ||
                              !!isPendingUpdate
                            }
                            isAddingWatchlist={
                              !!isPendingCreate && createMovie.variables?.data.status === "watchlist"
                            }
                          />
                        );
                      })}
                    </div>
                  ) : debouncedQuery.length > 1 ? (
                    <div className="text-center py-20 space-y-2">
                      <p className="text-muted-foreground">
                        {onMyServices
                          ? `No results for "${debouncedQuery}" on your streaming services`
                          : `No results found for "${debouncedQuery}"`}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-20 text-muted-foreground/50">
                      <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p>Type a film title to add it to your vault</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {discoverEnabled && <DiscoverPanels activeTab={activeTab} />}
        </Tabs>
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
