import { useState, useMemo, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LanguageBadge } from "@/components/language-badge";
import { getPosterUrl } from "@/lib/movie-utils";
import {
  useGetTrendingIndia,
  getGetTrendingIndiaQueryKey,
  useGetBecauseYouLiked,
  getGetBecauseYouLikedQueryKey,
  useGetAiSuggestions,
  useDiscoverIndian,
  getDiscoverIndianQueryKey,
  useCreateMovie,
  useListMovies,
  getListMoviesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, TrendingUp, ThumbsUp, Loader2, Bot,
  Check, Eye, BookmarkPlus, Film, X, MessageCircleHeart,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// ---------------------------------------------------------------------------
// Dismissed-movies hook — persisted to localStorage
// ---------------------------------------------------------------------------
const STORAGE_KEY = "cinevault:dismissed";

function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

function useDismissed() {
  const [dismissed, setDismissed] = useState<Set<number>>(loadDismissed);

  const dismiss = useCallback((tmdbId: number | null | undefined) => {
    if (tmdbId == null) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(tmdbId);
      saveDismissed(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDismissed(new Set());
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { dismissed, dismiss, clearAll };
}

// ---------------------------------------------------------------------------
// Poster card — always-visible buttons + dismiss ×
// ---------------------------------------------------------------------------
function SuggestionPosterCard({
  movie,
  inLibrary,
  onAdd,
  onDismiss,
}: {
  movie: any;
  inLibrary: boolean;
  onAdd: (movie: any, status: "watched" | "watchlist") => void;
  onDismiss: (tmdbId: number | null) => void;
}) {
  const posterUrl = getPosterUrl(movie.posterPath ?? movie.poster_path);

  return (
    <div className="flex flex-col gap-2">
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-secondary/50 border border-border/50 shadow-md group">
        {posterUrl ? (
          <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-2 text-center">
            <Film className="w-8 h-8 mb-1 opacity-40" />
            <span className="text-[10px]">{movie.title}</span>
          </div>
        )}

        {/* Language badge */}
        <div className="absolute top-2 left-2">
          <LanguageBadge language={movie.originalLanguage ?? movie.language} />
        </div>

        {/* Dismiss × — always visible on mobile, hover-reveal on desktop */}
        <button
          onClick={() => onDismiss(movie.tmdbId)}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black"
          title="Not interested"
          aria-label="Not interested"
        >
          <X className="w-3 h-3" />
        </button>

        {/* In Library overlay */}
        {inLibrary && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
            <span className="flex items-center gap-1 bg-white text-black text-[10px] font-bold px-2 py-1 rounded-full shadow">
              <Check className="w-3 h-3" /> In Library
            </span>
          </div>
        )}
      </div>

      {/* Title + year */}
      <div className="px-0.5">
        <p className="text-xs font-medium line-clamp-1 leading-tight" title={movie.title}>{movie.title}</p>
        {(movie.releaseYear ?? movie.year) && (
          <p className="text-[10px] text-muted-foreground font-mono">{movie.releaseYear ?? movie.year}</p>
        )}
      </div>

      {/* Action buttons */}
      {!inLibrary && (
        <div className="flex gap-1">
          <Button size="sm" className="flex-1 h-7 text-[10px] px-1 gap-1" onClick={() => onAdd(movie, "watched")}>
            <Eye className="w-3 h-3" /> Watched
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] px-1 gap-1 bg-transparent" onClick={() => onAdd(movie, "watchlist")}>
            <BookmarkPlus className="w-3 h-3" /> Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI friend card — warm, conversational recommendation card
// ---------------------------------------------------------------------------
const LANG_FLAG: Record<string, string> = {
  ml: "🇮🇳", ta: "🇮🇳", te: "🇮🇳", hi: "🇮🇳", kn: "🇮🇳", bn: "🇮🇳",
  ko: "🇰🇷", ja: "🇯🇵", zh: "🇨🇳", fr: "🇫🇷", de: "🇩🇪",
  it: "🇮🇹", es: "🇪🇸", pt: "🇵🇹", fa: "🇮🇷", ar: "🇸🇦",
  tr: "🇹🇷", he: "🇮🇱", ru: "🇷🇺", th: "🇹🇭", id: "🇮🇩",
  en: "🇬🇧",
};

function AiFriendCard({
  movie,
  inLibrary,
  onAdd,
  onDismiss,
}: {
  movie: any;
  inLibrary: boolean;
  onAdd: (movie: any, status: "watched" | "watchlist") => void;
  onDismiss: (tmdbId: number | null) => void;
}) {
  const posterUrl = movie.posterPath
    ? `https://image.tmdb.org/t/p/w342${movie.posterPath}`
    : null;
  const flag = LANG_FLAG[movie.language ?? ""] ?? "🎬";

  return (
    <div className="flex gap-4 p-4 bg-card border border-border/50 rounded-2xl relative group hover:border-border transition-colors">
      {/* Dismiss */}
      <button
        onClick={() => onDismiss(movie.tmdbId)}
        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-secondary text-muted-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-all z-10"
        title="Not interested"
        aria-label="Not interested"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Poster */}
      <div className="relative shrink-0 w-[72px] rounded-xl overflow-hidden bg-secondary border border-border/50" style={{ aspectRatio: "2/3" }}>
        {posterUrl ? (
          <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
        {inLibrary && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
            <Check className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2 pr-4">
        {/* Title + meta */}
        <div>
          <h3 className="font-semibold text-sm leading-snug">{movie.title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {flag} {movie.language?.toUpperCase()} · {movie.year}
          </p>
        </div>

        {/* Hook — the friend's opener */}
        {movie.hook && (
          <p className="text-sm font-medium leading-snug text-foreground/90">
            "{movie.hook}"
          </p>
        )}

        {/* Reason — personal, conversational */}
        {movie.reason && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {movie.reason}
          </p>
        )}

        {/* Mood tags */}
        {Array.isArray(movie.mood) && movie.mood.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {movie.mood.map((m: string) => (
              <span
                key={m}
                className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {m}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {!inLibrary ? (
          <div className="flex gap-1.5 pt-0.5">
            <Button size="sm" className="h-7 text-[10px] px-3 gap-1" onClick={() => onAdd(movie, "watched")}>
              <Eye className="w-3 h-3" /> Watched it
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-3 gap-1 bg-transparent" onClick={() => onAdd(movie, "watchlist")}>
              <BookmarkPlus className="w-3 h-3" /> Save
            </Button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Check className="w-3 h-3" /> Already in your library
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SuggestionsPage() {
  const queryClient = useQueryClient();
  const createMovie = useCreateMovie();
  const { dismissed, dismiss, clearAll } = useDismissed();

  const [activeTab, setActiveTab] = useState("foryou");
  const [trendingLang, setTrendingLang] = useState<string>("all");

  const { data: library } = useListMovies(undefined, { query: { queryKey: getListMoviesQueryKey() } });
  const inLibrarySet = useMemo(
    () => new Set((library ?? []).map((m) => m.tmdbId).filter(Boolean)),
    [library]
  );

  const { data: trending, isLoading: isLoadingTrending } = useGetTrendingIndia({
    query: { enabled: activeTab === "trending" && trendingLang === "all", queryKey: getGetTrendingIndiaQueryKey() },
  });
  const { data: discover, isLoading: isLoadingDiscover } = useDiscoverIndian(
    { language: trendingLang },
    { query: { enabled: activeTab === "trending" && trendingLang !== "all", queryKey: getDiscoverIndianQueryKey({ language: trendingLang }) } }
  );
  const { data: becauseLiked, isLoading: isLoadingLiked } = useGetBecauseYouLiked({
    query: { enabled: activeTab === "liked", queryKey: getGetBecauseYouLikedQueryKey() },
  });

  const getAiSuggestions = useGetAiSuggestions();
  const [aiResults, setAiResults] = useState<any[] | null>(null);
  const [aiSource, setAiSource] = useState<"ai" | "tmdb" | null>(null);

  const handleGenerateAi = () => {
    getAiSuggestions.mutate({ data: { count: 10 } }, {
      onSuccess: (data: any[]) => {
        setAiResults(data);
        const hasTmdb = data.some((d: any) => d.source === "tmdb");
        const hasAi = data.some((d: any) => d.source === "ai");
        setAiSource(hasAi && !hasTmdb ? "ai" : "tmdb");
      },
      onError: () => toast.error("Could not load suggestions. Please try again."),
    });
  };

  const handleAdd = (movie: any, status: "watched" | "watchlist") => {
    createMovie.mutate({
      data: {
        title: movie.title,
        status,
        ...(movie.tmdbId != null && { tmdbId: movie.tmdbId }),
        ...(movie.posterPath != null && { posterPath: movie.posterPath }),
        ...((movie.releaseYear ?? movie.year) != null && { releaseYear: movie.releaseYear ?? movie.year }),
        ...((movie.originalLanguage ?? movie.language) != null && { originalLanguage: movie.originalLanguage ?? movie.language }),
      },
    }, {
      onSuccess: () => {
        toast.success(`Added "${movie.title}" to ${status}`);
        queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      },
    });
  };

  const trendingData = trendingLang === "all" ? trending : discover;
  const isLoadingTrendingData = trendingLang === "all" ? isLoadingTrending : isLoadingDiscover;

  // Filter helpers
  const notDismissed = (m: any) => !dismissed.has(m.tmdbId);
  const visibleTrending = trendingData?.filter(notDismissed) ?? [];
  const visibleLiked = becauseLiked?.filter(notDismissed) ?? [];
  const visibleAi = aiResults?.filter(notDismissed) ?? [];

  const dismissedCount = dismissed.size;

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <section className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              Discover
            </h1>
            <p className="text-muted-foreground mt-1">Your personal film friend, always ready with a great pick.</p>
          </div>
          {dismissedCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 mt-1 shrink-0"
            >
              Reset {dismissedCount} hidden
            </button>
          )}
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-secondary p-1 rounded-xl h-12">
            <TabsTrigger value="foryou" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <MessageCircleHeart className="w-4 h-4 mr-2" /> For You
            </TabsTrigger>
            <TabsTrigger value="liked" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <ThumbsUp className="w-4 h-4 mr-2" /> Because You Liked
            </TabsTrigger>
            <TabsTrigger value="trending" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
              <TrendingUp className="w-4 h-4 mr-2" /> Trending India
            </TabsTrigger>
          </TabsList>

          {/* ── AI Curated ── */}
          <TabsContent value="foryou" className="mt-6 space-y-6">
            {aiSource === "tmdb" && aiResults && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/60 border border-border/50 rounded-lg px-3 py-2">
                <Bot className="w-3.5 h-3.5 shrink-0" />
                AI unavailable — showing TMDB-curated picks based on your library.
              </div>
            )}

            {!aiResults && !getAiSuggestions.isPending ? (
              /* Empty state */
              <div className="text-center py-16 bg-card rounded-2xl border border-border border-dashed">
                <MessageCircleHeart className="w-14 h-14 text-primary mx-auto mb-5 opacity-80" />
                <h3 className="text-xl font-semibold mb-2">What should I watch this weekend?</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6 text-sm leading-relaxed">
                  I'll look at what you've watched and come back with picks that actually fit your taste — with a personal note on each one.
                </p>
                <Button onClick={handleGenerateAi} size="lg" className="px-8">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Find films for me
                </Button>
              </div>
            ) : getAiSuggestions.isPending ? (
              /* Loading */
              <div className="flex flex-col items-center justify-center py-28 space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <div className="text-center space-y-1">
                  <p className="text-foreground font-medium animate-pulse">Thinking about what you'd love…</p>
                  <p className="text-xs text-muted-foreground">Going through your watch history</p>
                </div>
              </div>
            ) : (
              /* Results — friend-style cards */
              <>
                <div className="space-y-3 max-w-2xl">
                  {visibleAi.map((movie, i) => (
                    <AiFriendCard
                      key={movie.tmdbId ?? i}
                      movie={movie}
                      inLibrary={movie.tmdbId ? inLibrarySet.has(movie.tmdbId) : false}
                      onAdd={handleAdd}
                      onDismiss={dismiss}
                    />
                  ))}
                </div>

                {visibleAi.length === 0 && aiResults && aiResults.length > 0 && (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    All suggestions hidden.{" "}
                    <button onClick={clearAll} className="underline underline-offset-2 hover:text-foreground">
                      Restore them
                    </button>
                  </div>
                )}

                <div className="flex justify-center mt-2">
                  <Button variant="ghost" onClick={handleGenerateAi} className="text-muted-foreground gap-2">
                    <Sparkles className="w-4 h-4" /> Show me more picks
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Because You Liked ── */}
          <TabsContent value="liked" className="mt-6 space-y-4">
            {isLoadingLiked ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : !becauseLiked?.length ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground">Rate some movies "Loved" or "Great" to get recommendations.</p>
              </div>
            ) : visibleLiked.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-sm">
                All suggestions hidden. <button onClick={clearAll} className="underline underline-offset-2 hover:text-foreground">Restore them</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {visibleLiked.map((movie) => (
                  <SuggestionPosterCard
                    key={movie.tmdbId}
                    movie={movie}
                    inLibrary={!!movie.tmdbId && inLibrarySet.has(movie.tmdbId)}
                    onAdd={handleAdd}
                    onDismiss={dismiss}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Trending India ── */}
          <TabsContent value="trending" className="mt-6 space-y-4">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex w-max space-x-2 pb-4">
                {["all", "te", "ta", "ml", "kn", "hi"].map((lang) => (
                  <Button
                    key={lang}
                    variant={trendingLang === lang ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setTrendingLang(lang)}
                    className="rounded-full px-5"
                  >
                    {lang === "all" ? "All India" : lang.toUpperCase()}
                  </Button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {isLoadingTrendingData ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : visibleTrending.length === 0 && (trendingData?.length ?? 0) > 0 ? (
              <div className="text-center py-20 text-muted-foreground text-sm">
                All suggestions hidden. <button onClick={clearAll} className="underline underline-offset-2 hover:text-foreground">Restore them</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {visibleTrending.map((movie) => (
                  <SuggestionPosterCard
                    key={movie.tmdbId}
                    movie={movie}
                    inLibrary={!!movie.tmdbId && inLibrarySet.has(movie.tmdbId)}
                    onAdd={handleAdd}
                    onDismiss={dismiss}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
