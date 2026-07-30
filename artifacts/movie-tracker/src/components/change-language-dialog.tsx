import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Languages, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useUpdateMovie,
  searchTmdb,
  getSearchTmdbQueryKey,
  getListMoviesQueryKey,
  getGetMovieQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LanguageBadge } from "@/components/language-badge";
import { getPosterUrl } from "@/lib/movie-utils";
import { LANGUAGE_GROUPS } from "@/components/taste-picker";
import { cn } from "@/lib/utils";

const LANG_NAMES: Record<string, string> = Object.fromEntries(
  LANGUAGE_GROUPS.flatMap((g) => g.langs.map((l) => [l.code, l.name])),
);

const QUICK_LANGS = [
  "te", "ta", "ml", "kn", "hi", "bn", "mr", "en", "ko", "ja",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movieId: number;
  title: string;
  currentLanguage: string | null | undefined;
  currentTmdbId?: number | null;
  libraryTmdbIds?: Set<number>;
};

export function ChangeLanguageDialog({
  open,
  onOpenChange,
  movieId,
  title,
  currentLanguage,
  currentTmdbId,
  libraryTmdbIds,
}: Props) {
  const queryClient = useQueryClient();
  const updateMovie = useUpdateMovie();
  const [query, setQuery] = useState(title);
  const [versionLangFilter, setVersionLangFilter] = useState<string>("all");

  useEffect(() => {
    if (open) {
      setQuery(title);
      setVersionLangFilter("all");
    }
  }, [open, title]);

  const searchEnabled = open && query.trim().length >= 2;
  const { data: results = [], isFetching } = useQuery({
    queryKey: getSearchTmdbQueryKey({ q: query.trim(), region: "IN" }),
    queryFn: ({ signal }) => searchTmdb({ q: query.trim(), region: "IN" }, { signal }),
    enabled: searchEnabled,
    staleTime: 60_000,
  });

  const versions = useMemo(() => {
    const filtered = results.filter((m) => {
      if (versionLangFilter !== "all" && m.originalLanguage !== versionLangFilter) return false;
      return true;
    });
    // Prefer other-language versions of the same title; keep current for context.
    return filtered.slice(0, 12);
  }, [results, versionLangFilter]);

  const versionLangs = useMemo(() => {
    const s = new Set<string>();
    for (const m of results) {
      if (m.originalLanguage) s.add(m.originalLanguage);
    }
    return Array.from(s).sort();
  }, [results]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMovieQueryKey(movieId) });
    queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey({ status: "watched" }) });
    queryClient.invalidateQueries({ queryKey: getListMoviesQueryKey({ status: "watchlist" }) });
  };

  const setLanguageOnly = (code: string) => {
    updateMovie.mutate(
      { id: movieId, data: { originalLanguage: code } },
      {
        onSuccess: () => {
          toast.success(`Language set to ${LANG_NAMES[code] ?? code.toUpperCase()}`);
          invalidate();
          onOpenChange(false);
        },
        onError: () => toast.error("Couldn't update language"),
      },
    );
  };

  const switchVersion = (version: (typeof results)[number]) => {
    if (version.tmdbId === currentTmdbId) {
      // Same entry — just sync language label if needed.
      if (version.originalLanguage && version.originalLanguage !== currentLanguage) {
        setLanguageOnly(version.originalLanguage);
      } else {
        onOpenChange(false);
      }
      return;
    }

    if (
      version.tmdbId != null &&
      libraryTmdbIds?.has(version.tmdbId) &&
      version.tmdbId !== currentTmdbId
    ) {
      toast.error("That version is already in your library");
      return;
    }

    updateMovie.mutate(
      {
        id: movieId,
        data: {
          title: version.title,
          tmdbId: version.tmdbId ?? null,
          posterPath: version.posterPath ?? null,
          releaseYear: version.releaseYear ?? null,
          originalLanguage: version.originalLanguage ?? null,
          genres: version.genres ?? null,
          overview: version.overview ?? null,
        },
      },
      {
        onSuccess: () => {
          const lang = version.originalLanguage
            ? LANG_NAMES[version.originalLanguage] ?? version.originalLanguage.toUpperCase()
            : "unknown";
          toast.success(`Switched to ${lang} version`);
          invalidate();
          onOpenChange(false);
        },
        onError: () => toast.error("Couldn't switch version"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="w-4 h-4" />
            Change language
          </DialogTitle>
          <DialogDescription>
            Fix the language if you watched a different regional version of{" "}
            <span className="text-foreground font-medium">{title}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Currently
            {currentLanguage ? (
              <LanguageBadge language={currentLanguage} className="bg-secondary text-foreground border-border" />
            ) : (
              <span className="text-xs">not set</span>
            )}
          </div>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              I watched it in
            </h3>
            <div className="flex flex-wrap gap-2">
              {QUICK_LANGS.map((code) => (
                <button
                  key={code}
                  type="button"
                  disabled={updateMovie.isPending}
                  onClick={() => setLanguageOnly(code)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm border transition-colors",
                    currentLanguage === code
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  {LANG_NAMES[code] ?? code.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Updates the language label only — keeps the current poster and TMDB match.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Or switch to another version
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title…"
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary border border-border text-sm outline-none focus:border-foreground/30"
              />
            </div>

            {versionLangs.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setVersionLangFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] border",
                    versionLangFilter === "all"
                      ? "bg-white text-black border-white"
                      : "border-border text-muted-foreground",
                  )}
                >
                  All
                </button>
                {versionLangs.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setVersionLangFilter(code)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] border",
                      versionLangFilter === code
                        ? "bg-white text-black border-white"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {LANG_NAMES[code] ?? code.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {isFetching ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {searchEnabled ? "No versions found — try a shorter title." : "Type a title to search."}
              </p>
            ) : (
              <ul className="space-y-2">
                {versions.map((m) => {
                  const isCurrent = m.tmdbId === currentTmdbId;
                  const alreadyInLibrary =
                    m.tmdbId != null &&
                    libraryTmdbIds?.has(m.tmdbId) &&
                    !isCurrent;
                  const poster = getPosterUrl(m.posterPath);
                  return (
                    <li key={m.tmdbId ?? `${m.title}-${m.releaseYear}`}>
                      <button
                        type="button"
                        disabled={updateMovie.isPending || alreadyInLibrary}
                        onClick={() => switchVersion(m)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-colors",
                          isCurrent
                            ? "border-primary/40 bg-primary/5"
                            : "border-border hover:border-foreground/30 hover:bg-secondary/40",
                          alreadyInLibrary && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <div className="w-10 aspect-[2/3] rounded-md overflow-hidden bg-secondary shrink-0">
                          {poster ? (
                            <img src={poster} alt="" className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {m.releaseYear ?? "—"}
                            {m.originalLanguage
                              ? ` · ${LANG_NAMES[m.originalLanguage] ?? m.originalLanguage.toUpperCase()}`
                              : ""}
                            {isCurrent ? " · current" : ""}
                            {alreadyInLibrary ? " · already in library" : ""}
                          </p>
                        </div>
                        <LanguageBadge
                          language={m.originalLanguage}
                          className="bg-secondary text-foreground border-border shrink-0"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { LANG_NAMES };
