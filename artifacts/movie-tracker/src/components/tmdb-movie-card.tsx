import { Film, Check } from "lucide-react";
import { getPosterUrl } from "@/lib/movie-utils";
import { LanguageBadge } from "./language-badge";
import { Button } from "@/components/ui/button";

interface TmdbMovieCardProps {
  tmdbId: number;
  title: string;
  posterPath?: string | null;
  language?: string | null;
  // also accept the TMDB field names the search result uses
  originalLanguage?: string | null;
  year?: number | null;
  releaseYear?: number | null;
  overview?: string | null;
  inLibrary?: boolean;
  libraryStatus?: "watched" | "watchlist";
  onAddWatched: () => void;
  onAddWatchlist: () => void;
  isAddingWatched?: boolean;
  isAddingWatchlist?: boolean;
}

export function TmdbMovieCard({
  title,
  posterPath,
  language,
  originalLanguage,
  year,
  releaseYear,
  overview,
  inLibrary = false,
  libraryStatus,
  onAddWatched,
  onAddWatchlist,
  isAddingWatched,
  isAddingWatchlist,
}: TmdbMovieCardProps) {
  const posterUrl = getPosterUrl(posterPath);
  const displayLang = language ?? originalLanguage;
  const displayYear = year ?? releaseYear;
  const alreadyWatched = inLibrary && libraryStatus === "watched";
  const onWatchlist = inLibrary && libraryStatus === "watchlist";

  return (
    <div className="flex bg-card border border-border rounded-xl overflow-hidden shadow-sm hover-elevate">
      <div className="w-24 sm:w-32 flex-shrink-0 bg-secondary relative">
        {posterUrl ? (
          <img src={posterUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground p-2 text-center bg-secondary">
            <Film className="w-6 h-6 opacity-50" />
          </div>
        )}
      </div>

      <div className="flex-1 p-3 sm:p-4 flex flex-col min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <div>
            <h3 className="font-semibold text-sm sm:text-base leading-tight text-foreground truncate">{title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <LanguageBadge language={displayLang} />
              {displayYear && <span className="text-xs text-muted-foreground font-mono">{displayYear}</span>}
            </div>
          </div>
        </div>

        {overview && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-2 mb-3">
            {overview}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {alreadyWatched ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary rounded-lg px-3 py-1.5 w-full">
              <Check className="w-3.5 h-3.5 shrink-0 text-foreground" />
              <span>Already watched</span>
            </div>
          ) : onWatchlist ? (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={onAddWatched}
                disabled={isAddingWatched || isAddingWatchlist}
                className="flex-1 text-xs h-8"
              >
                {isAddingWatched ? "Saving…" : "Mark Watched"}
              </Button>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary rounded-lg px-2.5 h-8">
                <Check className="w-3 h-3 shrink-0" />
                On watchlist
              </div>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={onAddWatched}
                disabled={isAddingWatched || isAddingWatchlist}
                className="flex-1 text-xs h-8"
              >
                {isAddingWatched ? "Adding…" : "Mark Watched"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onAddWatchlist}
                disabled={isAddingWatched || isAddingWatchlist}
                className="flex-1 text-xs h-8 bg-transparent hover:bg-secondary"
              >
                {isAddingWatchlist ? "Adding…" : "Watchlist"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
