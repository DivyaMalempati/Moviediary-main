import { useMemo, useState } from "react";
import { Link } from "wouter";
import { LanguageBadge } from "@/components/language-badge";
import { Button } from "@/components/ui/button";
import { getPosterUrl } from "@/lib/movie-utils";
import {
  findLookingForward,
  formatReleaseCopy,
  formatReleaseDateLabel,
} from "@/lib/release-reminders";
import {
  useCreateMovie,
  useGetUpcomingReleases,
  useListMovies,
  getListMoviesQueryKey,
  getGetUpcomingReleasesQueryKey,
  type TmdbMovie,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  Check,
  Heart,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const LANG_FILTERS = [
  { value: "", label: "India + EN" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
  { value: "ml", label: "Malayalam" },
  { value: "kn", label: "Kannada" },
  { value: "hi", label: "Hindi" },
  { value: "en", label: "English" },
] as const;

function UpcomingPoster({
  title,
  posterPath,
  releaseDate,
  language,
  alreadySaved,
  saving,
  onLookForward,
}: {
  title: string;
  posterPath?: string | null;
  releaseDate?: string | null;
  language?: string | null;
  alreadySaved?: boolean;
  saving?: boolean;
  onLookForward?: () => void;
}) {
  const src = getPosterUrl(posterPath, "w500");
  return (
    <div className="group space-y-2">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary">
        {src ? (
          <img
            src={src}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <CalendarClock className="h-8 w-8 opacity-40" />
          </div>
        )}
        {language && (
          <div className="absolute left-2 top-2">
            <LanguageBadge language={language} />
          </div>
        )}
        {releaseDate && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-8">
            <p className="text-[11px] font-medium text-white/95">
              {formatReleaseDateLabel(releaseDate)}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{title}</p>
        {alreadySaved ? (
          <Button size="sm" variant="secondary" className="h-7 w-full gap-1 text-xs" disabled>
            <Check className="h-3 w-3" /> Looking forward
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 w-full gap-1 bg-white text-xs text-black hover:bg-white/90"
            disabled={saving}
            onClick={onLookForward}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Heart className="h-3 w-3" />
            )}
            Remind me
          </Button>
        )}
      </div>
    </div>
  );
}

export default function UpcomingPage() {
  const queryClient = useQueryClient();
  const [lang, setLang] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const upcomingParams = useMemo(
    () => ({
      region: "IN",
      days: 90,
      ...(lang ? { language: lang } : {}),
    }),
    [lang],
  );

  const { data: upcoming, isLoading: upcomingLoading, isError } = useGetUpcomingReleases(upcomingParams);
  const { data: watchlist, isLoading: watchlistLoading } = useListMovies({ status: "watchlist" });
  const createMovie = useCreateMovie();

  const libraryByTmdb = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of watchlist ?? []) {
      if (m.tmdbId != null) map.set(m.tmdbId, m.id);
    }
    return map;
  }, [watchlist]);

  const lookingForward = useMemo(
    () => findLookingForward(watchlist ?? [], { includePastDays: 14 }),
    [watchlist],
  );

  // Only future-dated films for the "Your upcoming" grid (released ones are in Just out / Watchlist)
  const savedUnreleased = useMemo(
    () => lookingForward.filter((f) => f.daysUntil > 0),
    [lookingForward],
  );

  const justOut = useMemo(
    () => lookingForward.filter((f) => f.daysUntil < 0),
    [lookingForward],
  );

  const soonReminders = useMemo(
    () => lookingForward.filter((f) => f.daysUntil >= 0 && f.daysUntil <= 7),
    [lookingForward],
  );

  const saveLookingForward = (movie: TmdbMovie) => {
    setSavingId(movie.tmdbId);
    createMovie.mutate(
      {
        data: {
          title: movie.title,
          status: "watchlist",
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
          toast.success(`We'll remind you about "${movie.title}"`);
          queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetUpcomingReleasesQueryKey(upcomingParams) });
          setSavingId(null);
        },
        onError: (err: any) => {
          if (err?.status === 409 || err?.response?.status === 409) {
            toast.info(`"${movie.title}" is already in your vault`);
            queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey() });
          } else {
            toast.error(`Couldn't save "${movie.title}"`);
          }
          setSavingId(null);
        },
      },
    );
  };

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-8">
        <section className="flex flex-col gap-2">
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <CalendarClock className="h-8 w-8 text-primary" />
            Upcoming
          </h1>
          <p className="max-w-xl text-muted-foreground">
            Browse releases coming to India and tap Remind me to save them as looking forward —
            we'll nudge you when they land.
          </p>
        </section>

        {justOut.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Bell className="h-4 w-4" /> Just out
            </h2>
            <div className="space-y-2">
              {justOut.slice(0, 4).map((film) => (
                <Link
                  key={film.id}
                  href={`/movie/${film.id}`}
                  className="flex items-center gap-3 rounded-xl border border-sky-400/30 bg-sky-400/5 px-3 py-2.5 transition-colors hover:bg-sky-400/10"
                >
                  {getPosterUrl(film.posterPath, "w500") ? (
                    <img
                      src={getPosterUrl(film.posterPath, "w500")!}
                      alt=""
                      className="h-14 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-secondary">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{film.title}</p>
                    <p className="text-xs text-muted-foreground">{formatReleaseCopy(film)}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono text-muted-foreground">
                    {formatReleaseDateLabel(film.releaseDate)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {soonReminders.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Bell className="h-4 w-4" /> Releasing soon
            </h2>
            <div className="space-y-2">
              {soonReminders.slice(0, 4).map((film) => (
                <Link
                  key={film.id}
                  href={`/movie/${film.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5 transition-colors hover:bg-card"
                >
                  {getPosterUrl(film.posterPath, "w500") ? (
                    <img
                      src={getPosterUrl(film.posterPath, "w500")!}
                      alt=""
                      className="h-14 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-secondary">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{film.title}</p>
                    <p className="text-xs text-muted-foreground">{formatReleaseCopy(film)}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono text-muted-foreground">
                    {formatReleaseDateLabel(film.releaseDate)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Your upcoming films</h2>
            {savedUnreleased.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {savedUnreleased.length} saved · unreleased
              </p>
            )}
          </div>
          {watchlistLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : savedUnreleased.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
              <Heart className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium">Nothing saved yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add an unreleased film from your watchlist or tap Remind me below.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-6">
              {savedUnreleased.map((film) => (
                <Link key={film.id} href={`/movie/${film.id}`} className="group space-y-2">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-secondary">
                    {getPosterUrl(film.posterPath, "w500") ? (
                      <img
                        src={getPosterUrl(film.posterPath, "w500")!}
                        alt={film.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-8">
                      <p className="text-[11px] font-medium text-white/95">
                        {film.daysUntil === 0
                          ? "Out today"
                          : film.daysUntil === 1
                            ? "Tomorrow"
                            : `In ${film.daysUntil}d`}
                      </p>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{film.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatReleaseDateLabel(film.releaseDate)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Coming to India</h2>
              <p className="text-sm text-muted-foreground">Next 90 days · theatrical / announced dates</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LANG_FILTERS.map((f) => (
                <button
                  key={f.value || "all"}
                  type="button"
                  onClick={() => setLang(f.value)}
                  className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                    lang === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {upcomingLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              Couldn't load upcoming releases. Try again in a moment.
            </div>
          ) : !upcoming?.length ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No dated releases in this window. Try another language.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:gap-6">
              {upcoming.map((movie) => (
                <UpcomingPoster
                  key={movie.tmdbId}
                  title={movie.title}
                  posterPath={movie.posterPath}
                  releaseDate={movie.releaseDate}
                  language={movie.originalLanguage}
                  alreadySaved={libraryByTmdb.has(movie.tmdbId)}
                  saving={savingId === movie.tmdbId}
                  onLookForward={() => saveLookingForward(movie)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
