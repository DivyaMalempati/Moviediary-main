import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  useGetMovie, 
  useUpdateMovie, 
  useDeleteMovie,
  useGetSimilarMovies,
  getGetSimilarMoviesQueryKey,
  useGetTmdbRecommendations,
  getGetTmdbRecommendationsQueryKey,
  useGetWatchProviders,
  getGetWatchProvidersQueryKey,
  getGetMovieQueryKey,
  useCreateMovie,
  useListMovies,
  getListMoviesQueryKey,
  useRewatchMovie,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getPosterUrl,
  RATING_LABELS,
  formatWatchDate,
  todayInputValue,
  toWatchDateInput,
} from "@/lib/movie-utils";
import { LanguageBadge } from "@/components/language-badge";
import { MoviePosterCard } from "@/components/movie-card";
import { Star, Heart, Bookmark, Check, Trash2, ArrowLeft, Loader2, Calendar, Clapperboard, Tv, Eye, BookmarkPlus, Film, FolderOpen, Plus, X, RotateCcw, Ban, Zap } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { ShareMovieSheet } from "@/components/share-movie-sheet";
import { formatStreamingServices, type ShareMovieInput } from "@/lib/share-movie";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RatingPickerDialog } from "@/components/rating-picker-dialog";
import { RewatchLogDialog } from "@/components/rewatch-log-dialog";
import { ChangeLanguageDialog } from "@/components/change-language-dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCollections,
  useMovieCollections,
  useAddToCollection,
  useRemoveFromCollection,
  useCreateCollection,
} from "@/lib/collections-api";
import { useMuteGenres } from "@/lib/preferences";
export default function MovieDetailsPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: movie, isLoading, isError } = useGetMovie(id, { query: { enabled: !!id, queryKey: getGetMovieQueryKey(id) } });
  const updateMovie = useUpdateMovie();
  const deleteMovie = useDeleteMovie();
  const createMovie = useCreateMovie();
  const rewatchMovie = useRewatchMovie();
  const { muteGenres, isPending: mutingGenres } = useMuteGenres();

  const { data: library } = useListMovies(undefined, { query: { queryKey: getListMoviesQueryKey() } });
  const libraryTmdbIds = useMemo(
    () => new Set((library ?? []).map((m) => m.tmdbId).filter((id): id is number => id != null)),
    [library],
  );

  const { data: similarMovies } = useGetSimilarMovies(movie?.tmdbId || 0, { query: { enabled: !!movie?.tmdbId, queryKey: getGetSimilarMoviesQueryKey(movie?.tmdbId || 0) } });
  const { data: recommendedMovies } = useGetTmdbRecommendations(movie?.tmdbId || 0, { query: { enabled: !!movie?.tmdbId, queryKey: getGetTmdbRecommendationsQueryKey(movie?.tmdbId || 0) } });

  const { data: watchProviders } = useGetWatchProviders(movie?.tmdbId || 0, {
    query: { enabled: !!movie?.tmdbId, queryKey: getGetWatchProvidersQueryKey(movie?.tmdbId || 0) }
  });

  const initializedForId = useRef<number | null>(null);
  const lastSaved = useRef({ rating: "", notes: "" });
  
  const [rating, setRating] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [languageOpen, setLanguageOpen] = useState(false);

  const debouncedRating = useDebounce(rating, 300);
  const debouncedNotes = useDebounce(notes, 1000);

  // Init local state
  useEffect(() => {
    if (movie && initializedForId.current !== id) {
      initializedForId.current = id;
      setRating(movie.rating || "");
      setNotes(movie.notes || "");
      lastSaved.current = { rating: movie.rating || "", notes: movie.notes || "" };
    }
  }, [movie, id]);

  const mutateFnRef = useRef(updateMovie.mutate);
  mutateFnRef.current = updateMovie.mutate;

  const saveChanges = useCallback((newRating: string, newNotes: string) => {
    mutateFnRef.current({
      id,
      data: {
        rating: newRating || null,
        notes: newNotes || null
      }
    }, {
      onSuccess: () => {
        queryClient.setQueryData(getGetMovieQueryKey(id), (old: any) => 
          old ? { ...old, rating: newRating || null, notes: newNotes || null } : old
        );
      }
    });
  }, [id, queryClient]);

  // Auto-save
  useEffect(() => {
    if (initializedForId.current !== id) return;
    if (debouncedRating !== lastSaved.current.rating || debouncedNotes !== lastSaved.current.notes) {
      saveChanges(debouncedRating, debouncedNotes);
      lastSaved.current = { rating: debouncedRating, notes: debouncedNotes };
    }
  }, [debouncedRating, debouncedNotes, id, saveChanges]);

  const [ratingDialogMovie, setRatingDialogMovie] = useState<{
    title: string;
    action: (payload: { rating: string | null; watchedAt: string | null }) => void;
    titleSuffix?: string;
    skipLabel?: string;
  } | null>(null);
  const [rewatchDialogOpen, setRewatchDialogOpen] = useState(false);
  const [editingWatchDate, setEditingWatchDate] = useState(false);
  const [watchDateDraft, setWatchDateDraft] = useState("");
  /** Chronological index into movie.rewatchDates being edited. */
  const [editingRewatchIndex, setEditingRewatchIndex] = useState<number | null>(null);
  const [rewatchDateDraft, setRewatchDateDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareMovieInput | null>(null);
  const [newColName, setNewColName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Collections
  const { data: allCollections } = useCollections();
  const { data: movieColIds } = useMovieCollections(movie?.id ?? 0, !!movie?.id);
  const addToCollection    = useAddToCollection();
  const removeFromCollection = useRemoveFromCollection();
  const createCollection   = useCreateCollection();
  const memberSet = new Set(movieColIds ?? []);
  // Smart collections fill themselves from rules — the API rejects manual adds.
  const manualCollections = (allCollections ?? []).filter(
    (col) => !Array.isArray(col.rules) || col.rules.length === 0,
  );
  const smartMemberships = (allCollections ?? []).filter(
    (col) => Array.isArray(col.rules) && col.rules.length > 0 && memberSet.has(col.id),
  );
  const memberCollections = manualCollections.filter((col) => memberSet.has(col.id));
  const addableCollections = manualCollections.filter((col) => !memberSet.has(col.id));

  const handleAddToCollection = async (collectionId: number, name: string) => {
    if (!movie) return;
    try {
      await addToCollection.mutateAsync({ collectionId, movieId: movie.id });
      toast.success(`Added to "${name}"`);
    } catch {
      toast.error(`Couldn't add to "${name}"`);
    }
  };

  const handleRemoveFromCollection = async (collectionId: number, name: string) => {
    if (!movie) return;
    try {
      await removeFromCollection.mutateAsync({ collectionId, movieId: movie.id });
      toast.success(`Removed from "${name}"`);
    } catch {
      toast.error(`Couldn't remove from "${name}"`);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!movie || !newColName.trim()) return;
    try {
      const col = await createCollection.mutateAsync({ name: newColName.trim() });
      await addToCollection.mutateAsync({ collectionId: col.id, movieId: movie.id });
      setNewColName("");
      setCreatingCollection(false);
      toast.success(`Added to "${col.name}"`);
    } catch {
      toast.error("Failed to create collection");
    }
  };

  const toggleStatus = () => {
    if (!movie) return;
    if (movie.status === "watched") {
      // watched → watchlist: no rating needed
      updateMovie.mutate({ id, data: { status: "watchlist" } }, {
        onSuccess: () => {
          toast.success("Moved to Watchlist");
          queryClient.invalidateQueries({ queryKey: getGetMovieQueryKey(id) });
        }
      });
    } else {
      // watchlist → watched: ask for rating
      setRatingDialogMovie({
        title: movie.title,
        action: ({ rating: selectedRating, watchedAt }) => {
          setRatingDialogMovie(null);
          updateMovie.mutate({
            id,
            data: {
              status: "watched",
              watchedAt,
              ...(selectedRating ? { rating: selectedRating } : {}),
            },
          }, {
            onSuccess: () => {
              if (selectedRating) setRating(selectedRating);
              toast.success(
                watchedAt
                  ? `Marked as Watched · ${formatWatchDate(watchedAt)}`
                  : "Marked as Watched",
                {
                action: {
                  label: "Share",
                  onClick: () => {
                    setSharePayload({
                      title: movie.title,
                      rating: selectedRating || rating || null,
                      notes: notes || movie.notes,
                      timesSeen: 1,
                      isRewatch: false,
                      releaseYear: movie.releaseYear,
                      posterPath: movie.posterPath,
                      streamingOn: formatStreamingServices(watchProviders?.flatrate),
                    });
                    setShareOpen(true);
                  },
                },
              });
              queryClient.invalidateQueries({ queryKey: getGetMovieQueryKey(id) });
            }
          });
        },
      });
    }
  };

  const handleDelete = () => {
    deleteMovie.mutate({ id }, {
      onSuccess: () => {
        toast.success("Movie deleted");
        setLocation("/");
      }
    });
  };

  const handleRewatch = () => {
    if (!movie) return;
    setRewatchDialogOpen(true);
  };

  const submitRewatch = (payload: { rating: string | null; watchedAt?: string | null }) => {
    setRewatchDialogOpen(false);
    if (!id) {
      toast.error("Couldn't log rewatch — film id missing");
      return;
    }
    const data: { rating?: string | null; watchedAt?: string | null } = {};
    if (payload.rating != null) data.rating = payload.rating;
    if (payload.watchedAt) data.watchedAt = payload.watchedAt;
    rewatchMovie.mutate(
      { id, data },
      {
        onSuccess: (updated) => {
          const times = 1 + (updated.rewatchCount ?? 0);
          const nextRating = payload.rating || updated.rating || rating || null;
          toast.success(
            payload.watchedAt
              ? `Rewatch logged · ×${times} · ${formatWatchDate(payload.watchedAt)}`
              : `Rewatch logged · ×${times}`,
            {
              action: {
                label: "Share",
                onClick: () => {
                  setSharePayload({
                    title: updated.title,
                    rating: nextRating,
                    notes: notes || updated.notes,
                    timesSeen: times,
                    isRewatch: true,
                    releaseYear: updated.releaseYear,
                    posterPath: updated.posterPath ?? movie?.posterPath,
                    streamingOn: formatStreamingServices(watchProviders?.flatrate),
                  });
                  setShareOpen(true);
                },
              },
            },
          );
          if (payload.rating) {
            setRating(payload.rating);
            lastSaved.current = { ...lastSaved.current, rating: payload.rating };
          }
          queryClient.invalidateQueries({ queryKey: getGetMovieQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          queryClient.invalidateQueries({ queryKey: ["movie-stats"] });
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

  const doAddTmdb = (
    tmdbMovie: any,
    status: "watched" | "watchlist",
    rating?: string | null,
    watchedAt?: string | null,
  ) => {
    createMovie.mutate({
      data: {
        title: tmdbMovie.title,
        status,
        ...(rating ? { rating } : {}),
        ...(status === "watched" ? { watchedAt: watchedAt ?? null } : {}),
        ...(tmdbMovie.tmdbId != null && { tmdbId: tmdbMovie.tmdbId }),
        ...(tmdbMovie.posterPath != null && { posterPath: tmdbMovie.posterPath }),
        ...(tmdbMovie.releaseYear != null && { releaseYear: tmdbMovie.releaseYear }),
        ...(tmdbMovie.releaseDate != null && { releaseDate: tmdbMovie.releaseDate }),
        ...(tmdbMovie.originalLanguage != null && { originalLanguage: tmdbMovie.originalLanguage }),
      }
    }, {
      onSuccess: () => {
        toast.success(`Added ${tmdbMovie.title}`);
        queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      }
    });
  };

  const handleAddTmdb = (tmdbMovie: any, status: "watched" | "watchlist") => {
    if (status === "watched") {
      setRatingDialogMovie({
        title: tmdbMovie.title,
        action: ({ rating: r, watchedAt }) => {
          setRatingDialogMovie(null);
          doAddTmdb(tmdbMovie, "watched", r, watchedAt);
        },
      });
    } else {
      doAddTmdb(tmdbMovie, "watchlist");
    }
  };

  const saveFirstWatchDate = (next: string | null) => {
    if (!id || !movie) return;
    // Edit first watch only — never rewrite rewatchDates (that was gluing dates together).
    updateMovie.mutate(
      { id, data: { firstWatchedAt: next } },
      {
        onSuccess: () => {
          setEditingWatchDate(false);
          toast.success(
            next ? `First watched · ${formatWatchDate(next)}` : "First watch date cleared",
          );
          queryClient.invalidateQueries({ queryKey: getGetMovieQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          queryClient.invalidateQueries({ queryKey: ["movie-stats"] });
        },
        onError: () => toast.error("Couldn’t update first watch date"),
      },
    );
  };

  const saveRewatchDate = (chronoIndex: number, next: string) => {
    if (!id || !movie || !next) return;
    const dates = [...(movie.rewatchDates ?? [])];
    if (chronoIndex < 0 || chronoIndex >= dates.length) return;
    dates[chronoIndex] = next;
    updateMovie.mutate(
      { id, data: { rewatchDates: dates } },
      {
        onSuccess: () => {
          setEditingRewatchIndex(null);
          toast.success(`Rewatch date · ${formatWatchDate(next)}`);
          queryClient.invalidateQueries({ queryKey: getGetMovieQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          queryClient.invalidateQueries({ queryKey: ["movie-stats"] });
        },
        onError: () => toast.error("Couldn’t update rewatch date"),
      },
    );
  };

  /** Remove a dated rewatch entirely (date + count). */
  const deleteRewatchDate = (chronoIndex: number, label: string | null) => {
    if (!id || !movie) return;
    const dates = [...(movie.rewatchDates ?? [])];
    if (chronoIndex < 0 || chronoIndex >= dates.length) return;
    dates.splice(chronoIndex, 1);
    // Server recomputes last-watched from firstWatchedAt + remaining rewatchDates.
    updateMovie.mutate(
      {
        id,
        data: {
          rewatchDates: dates,
          rewatchCount: Math.max(0, (movie.rewatchCount ?? 0) - 1),
        },
      },
      {
        onSuccess: () => {
          setEditingRewatchIndex(null);
          toast.success(
            label ? `Deleted rewatch · ${label}` : "Deleted rewatch",
          );
          queryClient.invalidateQueries({ queryKey: getGetMovieQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
          queryClient.invalidateQueries({ queryKey: ["movie-stats"] });
        },
        onError: () => toast.error("Couldn’t delete rewatch"),
      },
    );
  };

  const handleMuteLikeThis = async () => {
    const genres = (movie?.genres ?? []).slice(0, 2);
    if (!genres.length) {
      toast.message("No genres on this title to mute");
      return;
    }
    try {
      await muteGenres(genres);
      toast.success(`Won't recommend ${genres.join(" / ")} films`, {
        description: "Change this anytime in Profile → Preferences.",
      });
    } catch {
      toast.error("Couldn't update preferences");
    }
  };

  if (isLoading) {
    return (
      <>
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (isError || !movie) {
    return (
      <>
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold">Movie not found</h2>
          <Button variant="link" onClick={() => setLocation("/")} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Vault
          </Button>
        </div>
      </>
    );
  }

  const posterUrl = getPosterUrl(movie.posterPath, "w780");

  return (
    <>
      {/* Back button */}
      <div className="sticky top-0 z-40 px-4 md:px-8 py-3 bg-background/80 backdrop-blur-md border-b border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </div>

      {/* Hero Header */}
      <div className="relative w-full bg-black md:h-[60vh]">
        {posterUrl ? (
          <>
            <div className="absolute inset-0">
              <img 
                src={posterUrl} 
                alt={movie.title} 
                className="w-full h-full object-cover opacity-40 blur-sm"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-secondary">
            <Clapperboard className="w-24 h-24 text-muted-foreground opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          </div>
        )}

        <div className="relative md:absolute md:bottom-0 md:left-0 md:right-0 p-4 md:p-10 max-w-7xl mx-auto flex flex-row gap-4 md:gap-8 items-center md:items-end z-10">
          <div className="w-1/3 md:w-48 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border-2 border-border/50 bg-secondary flex-shrink-0 relative md:transform md:translate-y-8">
            {posterUrl ? (
              <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Clapperboard className="opacity-50" /></div>
            )}
          </div>
          
          <div className="flex-1 space-y-2 md:space-y-4">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={() => setLanguageOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md hover:opacity-90 transition-opacity"
                title="Change language / version"
              >
                <LanguageBadge language={movie.originalLanguage} className="text-xs px-2 py-1" />
                <span className="text-[11px] text-white/70 underline underline-offset-2">
                  Change
                </span>
              </button>
              {movie.releaseDate ? (
                <Badge variant="outline" className="bg-background/50 backdrop-blur font-mono border-white/10">
                  <Calendar className="w-3 h-3 mr-1" /> {movie.releaseDate}
                </Badge>
              ) : movie.releaseYear ? (
                <Badge variant="outline" className="bg-background/50 backdrop-blur font-mono border-white/10">
                  <Calendar className="w-3 h-3 mr-1" /> {movie.releaseYear}
                </Badge>
              ) : null}
            </div>
            
            <h1 className="text-xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white drop-shadow-md leading-tight">
              {movie.title}
            </h1>

            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 text-sm text-gray-300">
                {movie.genres.map(g => (
                  <span key={g} className="px-2 py-0.5 rounded-full bg-white/10 border border-white/5 backdrop-blur-sm">
                    {g}
                  </span>
                ))}
              </div>
            )}
            
            <div className="flex items-center gap-2 md:gap-3 pt-1 md:pt-2 flex-wrap">
              {(() => {
                const isFuture = movie.releaseDate
                  ? new Date(`${movie.releaseDate}T12:00:00`) > new Date()
                  : false;
                // For unreleased movies on the watchlist, don't allow marking watched
                if (isFuture && movie.status === "watchlist") {
                  return (
                    <Button variant="outline" className="bg-background/50 backdrop-blur" disabled>
                      <Bookmark className="w-4 h-4 mr-2" />
                      In Watchlist · Unreleased
                    </Button>
                  );
                }
                return (
                  <Button
                    variant={movie.status === "watched" ? "default" : "outline"}
                    className={movie.status === "watched" ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "bg-background/50 backdrop-blur"}
                    onClick={toggleStatus}
                  >
                    {movie.status === "watched" ? <Check className="w-4 h-4 mr-2" /> : <Bookmark className="w-4 h-4 mr-2" />}
                    {movie.status === "watched" ? "Watched" : "In Watchlist"}
                  </Button>
                );
              })()}

              {movie.status === "watched" && (
                <Button
                  variant="outline"
                  className="bg-background/50 backdrop-blur"
                  onClick={handleRewatch}
                  disabled={rewatchMovie.isPending}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Rewatch{(movie.rewatchCount ?? 0) > 0 ? ` · ×${1 + movie.rewatchCount}` : ""}
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon" className="bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/30">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove "{movie.title}" from your vault permanently.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 md:p-10 pt-4 md:pt-20 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="md:col-span-2 space-y-10">
          {/* Overview */}
          {movie.overview && (
            <section>
              <h3 className="text-xl font-semibold mb-3">Synopsis</h3>
              <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                {movie.overview}
              </p>
            </section>
          )}

          {/* Watch history */}
          {movie.status === "watched" && (() => {
            const times = 1 + (movie.rewatchCount ?? 0);
            const dated = [...(movie.rewatchDates ?? [])].slice().reverse();
            const hasRewatches =
              (movie.rewatchCount ?? 0) > 0 || (movie.rewatchDates?.length ?? 0) > 0;
            // Prefer dedicated first-watch field; for never-rewatched titles,
            // fall back to watchedAt (legacy rows before firstWatchedAt existed).
            const firstIso =
              movie.firstWatchedAt ??
              (!hasRewatches ? movie.watchedAt ?? null : null);
            const undated =
              (movie.rewatchCount ?? 0) - (movie.rewatchDates?.length ?? 0);
            return (
              <section>
                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-primary" />
                  Watch history
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Watched ×{times}
                  {(movie.rewatchCount ?? 0) > 0
                    ? ` · ${movie.rewatchCount} rewatch${movie.rewatchCount === 1 ? "" : "es"}`
                    : ""}
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex flex-col gap-2 text-muted-foreground">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {hasRewatches ? "First watched" : "Watched"}{" "}
                        {firstIso ? (
                          <span className="text-foreground font-medium">
                            {formatWatchDate(firstIso)}
                          </span>
                        ) : (
                          <span className="text-foreground/80 italic">date unknown</span>
                        )}
                      </span>
                      {!editingWatchDate && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            setEditingRewatchIndex(null);
                            setWatchDateDraft(toWatchDateInput(firstIso));
                            setEditingWatchDate(true);
                          }}
                        >
                          Edit date
                        </button>
                      )}
                    </div>
                    {editingWatchDate && (
                      <div className="flex flex-wrap items-center gap-2 pl-5">
                        <Input
                          type="date"
                          value={watchDateDraft}
                          max={todayInputValue()}
                          onChange={(e) => setWatchDateDraft(e.target.value)}
                          className="h-8 w-auto bg-secondary border-border text-sm"
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => saveFirstWatchDate(watchDateDraft || null)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-muted-foreground"
                          onClick={() => saveFirstWatchDate(null)}
                        >
                          Not sure
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-muted-foreground"
                          onClick={() => setEditingWatchDate(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </li>
                  {dated.map((iso, i) => {
                    const chronoIndex = (movie.rewatchDates?.length ?? 0) - 1 - i;
                    const editing = editingRewatchIndex === chronoIndex;
                    return (
                      <li
                        key={`${iso}-${chronoIndex}`}
                        className="flex flex-col gap-2 text-muted-foreground"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Rewatched{" "}
                            <span className="text-foreground font-medium">
                              {formatWatchDate(iso)}
                            </span>
                          </span>
                          {!editing && (
                            <>
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => {
                                  setEditingWatchDate(false);
                                  setEditingRewatchIndex(chronoIndex);
                                  setRewatchDateDraft(toWatchDateInput(iso));
                                }}
                              >
                                Edit date
                              </button>
                              <button
                                type="button"
                                className="text-xs text-destructive hover:underline"
                                onClick={() => {
                                  const label = formatWatchDate(iso);
                                  if (
                                    !window.confirm(
                                      label
                                        ? `Delete rewatch on ${label}? This removes that rewatch from your count.`
                                        : "Delete this rewatch?",
                                    )
                                  ) {
                                    return;
                                  }
                                  deleteRewatchDate(chronoIndex, label);
                                }}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                        {editing && (
                          <div className="flex flex-wrap items-center gap-2 pl-5">
                            <Input
                              type="date"
                              value={rewatchDateDraft}
                              max={todayInputValue()}
                              onChange={(e) => setRewatchDateDraft(e.target.value)}
                              className="h-8 w-auto bg-secondary border-border text-sm"
                            />
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={!rewatchDateDraft}
                              onClick={() =>
                                saveRewatchDate(chronoIndex, rewatchDateDraft)
                              }
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-destructive"
                              onClick={() => {
                                const label = formatWatchDate(iso);
                                if (
                                  !window.confirm(
                                    label
                                      ? `Delete rewatch on ${label}? This removes that rewatch from your count. You can log it again with Rewatch.`
                                      : "Delete this rewatch? You can log it again with Rewatch.",
                                  )
                                ) {
                                  return;
                                }
                                deleteRewatchDate(chronoIndex, label);
                              }}
                            >
                              Delete
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-muted-foreground"
                              onClick={() => setEditingRewatchIndex(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {undated > 0 && (
                    <li className="text-xs text-muted-foreground/80 pl-5">
                      {undated} rewatch{undated === 1 ? "" : "es"} logged without a date
                    </li>
                  )}
                  {movie.createdAt && (
                    <li className="text-xs text-muted-foreground/70 pl-5">
                      Added to diary {formatWatchDate(movie.createdAt)}
                    </li>
                  )}
                </ul>
              </section>
            );
          })()}

          {/* Where to Watch */}
          {movie.tmdbId && (() => {
            const hasProviders = (watchProviders?.flatrate?.length ?? 0) > 0
              || (watchProviders?.rent?.length ?? 0) > 0
              || (watchProviders?.buy?.length ?? 0) > 0;
            if (!watchProviders) return null;
            return (
              <section>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Tv className="w-5 h-5 text-primary" /> Where to Watch
                </h3>
                {!hasProviders ? (
                  <p className="text-sm text-muted-foreground italic">Not available to stream in India.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start gap-4 overflow-x-auto pb-0.5 scrollbar-none">
                      {(
                        [
                          { label: "Stream", items: watchProviders.flatrate ?? [] },
                          { label: "Rent", items: watchProviders.rent ?? [] },
                          { label: "Buy", items: watchProviders.buy ?? [] },
                        ] as const
                      )
                        .filter((g) => g.items.length > 0)
                        .map((group) => (
                          <div key={group.label} className="shrink-0 space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                              {group.label}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {group.items.map((p) => (
                                <div
                                  key={p.name}
                                  title={p.name}
                                  className="w-9 h-9 rounded-lg overflow-hidden bg-secondary border border-border shrink-0"
                                >
                                  {p.logoPath ? (
                                    <img
                                      src={`https://image.tmdb.org/t/p/original${p.logoPath}`}
                                      alt={p.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="flex items-center justify-center w-full h-full text-[8px] font-semibold text-muted-foreground text-center leading-tight px-0.5">
                                      {p.name}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                    {watchProviders.link && (
                      <a
                        href={watchProviders.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-primary hover:underline"
                      >
                        View all options on JustWatch →
                      </a>
                    )}
                  </div>
                )}
              </section>
            );
          })()}

          {/* Personal Notes */}
          <section className="bg-secondary/30 border border-border p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
              <Star className="w-32 h-32" />
            </div>
            
            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
              My Journal
              {updateMovie.isPending && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </h3>
            
            <div className="space-y-6 relative z-10">
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">Rating</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(RATING_LABELS).map(([val, label]) => {
                    const isSelected = rating === val;
                    const isLoved = val === "loved";
                    return (
                      <button
                        key={val}
                        onClick={() => setRating(isSelected ? "" : val)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          isSelected 
                            ? "bg-white text-black shadow-lg shadow-white/10"
                            : "bg-background border border-border hover:border-white/30 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {isLoved ? <Heart className={`w-3 h-3 ${isSelected ? "fill-white" : ""}`} /> : <Star className={`w-3 h-3 ${isSelected ? "fill-current" : ""}`} />}
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">Notes</label>
                <Textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did you think of the cinematography? Standout performances?"
                  className="min-h-[150px] bg-background resize-y border-border focus-visible:ring-primary text-base"
                />
              </div>

              {movie.status === "watched" && (
                <ShareMovieSheet
                  movie={{
                    title: movie.title,
                    rating: rating || movie.rating,
                    notes: notes || movie.notes,
                    timesSeen: 1 + (movie.rewatchCount ?? 0),
                    isRewatch: (movie.rewatchCount ?? 0) > 0,
                    releaseYear: movie.releaseYear,
                    posterPath: movie.posterPath,
                    streamingOn: formatStreamingServices(watchProviders?.flatrate),
                  }}
                  trigger={
                    <Button variant="secondary" className="gap-2 w-full sm:w-auto">
                      Share rating & review
                    </Button>
                  }
                />
              )}

              {/* Collections */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5" /> Collections
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {memberCollections.map((col) => (
                    <span
                      key={col.id}
                      className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-xs font-medium border bg-white text-black border-white"
                    >
                      <Check className="w-3 h-3" />
                      {col.name}
                      <button
                        onClick={() => handleRemoveFromCollection(col.id, col.name)}
                        aria-label={`Remove from ${col.name}`}
                        className="rounded-full p-0.5 hover:bg-black/10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {smartMemberships.map((col) => (
                    <span
                      key={col.id}
                      title="Smart collection — membership follows its rules"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-primary/20 bg-primary/10 text-primary"
                    >
                      <Zap className="w-3 h-3" />
                      {col.name}
                    </span>
                  ))}
                  {memberCollections.length === 0 && smartMemberships.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Not in any collection yet.</p>
                  )}
                </div>

                {creatingCollection ? (
                  <div className="flex gap-2 pt-1">
                    <Input
                      autoFocus
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateAndAdd();
                        if (e.key === "Escape") { setNewColName(""); setCreatingCollection(false); }
                      }}
                      placeholder="New collection…"
                      className="h-8 text-xs bg-background border-border"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs gap-1 shrink-0"
                      onClick={handleCreateAndAdd}
                      disabled={!newColName.trim() || createCollection.isPending}
                    >
                      {createCollection.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Create & add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs shrink-0"
                      onClick={() => { setNewColName(""); setCreatingCollection(false); }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5">
                        <Plus className="w-3 h-3" />
                        Add to collection
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto w-56">
                      {addableCollections.length > 0 && (
                        <>
                          <DropdownMenuLabel className="text-xs">Your collections</DropdownMenuLabel>
                          {addableCollections.map((col) => (
                            <DropdownMenuItem
                              key={col.id}
                              className="text-xs"
                              onSelect={() => handleAddToCollection(col.id, col.name)}
                            >
                              {col.name}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        className="text-xs gap-1.5"
                        onSelect={() => { setNewColName(""); setCreatingCollection(true); }}
                      >
                        <Plus className="w-3 h-3" />
                        Create new collection…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar content */}
        <div className="space-y-8">
          {(movie.genres?.length ?? 0) > 0 && (
            <section>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 bg-transparent text-muted-foreground hover:text-foreground"
                onClick={handleMuteLikeThis}
                disabled={mutingGenres}
              >
                <Ban className="w-3.5 h-3.5" />
                Don&apos;t recommend movies like this
              </Button>
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Skips {(movie.genres ?? []).slice(0, 2).join(" / ")} in Discover and Swipe.
              </p>
            </section>
          )}

          {similarMovies && similarMovies.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold mb-4">Similar Films</h3>
              <div className="grid grid-cols-2 gap-3">
                {similarMovies.slice(0, 6).map(tmdb => {
                  const inLib = libraryTmdbIds.has(tmdb.tmdbId);
                  return (
                    <div key={tmdb.tmdbId} className="flex flex-col gap-1.5">
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-secondary/50 border border-border/50 shadow-md">
                        {tmdb.posterPath ? (
                          <img src={`https://image.tmdb.org/t/p/w342${tmdb.posterPath}`} alt={tmdb.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-2 text-center">
                            <Film className="w-6 h-6 mb-1 opacity-40" />
                            <span className="text-[10px]">{tmdb.title}</span>
                          </div>
                        )}
                        {inLib && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="flex items-center gap-1 bg-white text-black text-[10px] font-bold px-2 py-1 rounded-full shadow">
                              <Check className="w-3 h-3" /> In Library
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-medium line-clamp-1 leading-tight px-0.5" title={tmdb.title}>{tmdb.title}</p>
                      {!inLib && (
                        <div className="flex gap-1">
                          <Button size="sm" className="flex-1 h-7 text-[10px] px-1 gap-1" onClick={() => handleAddTmdb(tmdb, "watched")}>
                            <Eye className="w-3 h-3" /> Watched
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] px-1 gap-1 bg-transparent" onClick={() => handleAddTmdb(tmdb, "watchlist")}>
                            <BookmarkPlus className="w-3 h-3" /> Save
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {recommendedMovies && recommendedMovies.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold mb-4">You May Also Like</h3>
              <div className="grid grid-cols-2 gap-3">
                {recommendedMovies.slice(0, 6).map(tmdb => {
                  const inLib = libraryTmdbIds.has(tmdb.tmdbId);
                  return (
                    <div key={tmdb.tmdbId} className="flex flex-col gap-1.5">
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-secondary/50 border border-border/50 shadow-md">
                        {tmdb.posterPath ? (
                          <img src={`https://image.tmdb.org/t/p/w342${tmdb.posterPath}`} alt={tmdb.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-2 text-center">
                            <Film className="w-6 h-6 mb-1 opacity-40" />
                            <span className="text-[10px]">{tmdb.title}</span>
                          </div>
                        )}
                        {inLib && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="flex items-center gap-1 bg-white text-black text-[10px] font-bold px-2 py-1 rounded-full shadow">
                              <Check className="w-3 h-3" /> In Library
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-medium line-clamp-1 leading-tight px-0.5" title={tmdb.title}>{tmdb.title}</p>
                      {!inLib && (
                        <div className="flex gap-1">
                          <Button size="sm" className="flex-1 h-7 text-[10px] px-1 gap-1" onClick={() => handleAddTmdb(tmdb, "watched")}>
                            <Eye className="w-3 h-3" /> Watched
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] px-1 gap-1 bg-transparent" onClick={() => handleAddTmdb(tmdb, "watchlist")}>
                            <BookmarkPlus className="w-3 h-3" /> Save
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      <RatingPickerDialog
        open={!!ratingDialogMovie}
        movieTitle={ratingDialogMovie?.title ?? ""}
        confirmOnSelect
        titleSuffix={ratingDialogMovie?.titleSuffix}
        skipLabel={ratingDialogMovie?.skipLabel}
        onConfirm={(payload) => ratingDialogMovie?.action(payload)}
        onCancel={() => setRatingDialogMovie(null)}
      />
      <RewatchLogDialog
        open={rewatchDialogOpen}
        movieTitle={movie.title}
        onConfirm={submitRewatch}
        onCancel={() => setRewatchDialogOpen(false)}
      />
      {sharePayload && (
        <ShareMovieSheet
          movie={sharePayload}
          open={shareOpen}
          onOpenChange={(next) => {
            setShareOpen(next);
            if (!next) setSharePayload(null);
          }}
          hideTrigger
        />
      )}
      <ChangeLanguageDialog
        open={languageOpen}
        onOpenChange={setLanguageOpen}
        movieId={movie.id}
        title={movie.title}
        currentLanguage={movie.originalLanguage}
        currentTmdbId={movie.tmdbId}
        libraryTmdbIds={libraryTmdbIds}
      />
    </>
  );
}