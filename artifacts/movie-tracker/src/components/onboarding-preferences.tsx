import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film,
  ArrowRight,
  Check,
  Loader2,
  Clapperboard,
  Sparkles,
  MessageCircle,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguagePicker, GenrePicker } from "@/components/taste-picker";
import { useSavePreferences, PreferencesAuthError } from "@/lib/preferences";
import { getAuthHeaders } from "@/lib/demo-auth";
import { getPosterUrl } from "@/lib/movie-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SeedFilm = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  genres: string[] | null;
  overview: string | null;
};

type Step = "welcome" | "seed" | "prefs";

const VALUE_PROPS = [
  {
    icon: Clapperboard,
    title: "Track what you watch",
    desc: "A living diary of films — ratings, notes, and rewatches.",
  },
  {
    icon: Sparkles,
    title: "Get recommendations",
    desc: "Short swipe decks and Discover feeds tuned to your taste.",
  },
  {
    icon: Star,
    title: "Rate & remember",
    desc: "From Loved to Meh — capture how a film landed with you.",
  },
  {
    icon: MessageCircle,
    title: "Match & decide",
    desc: "Link a partner and find something you both want tonight.",
  },
];

async function fetchSeedMovies(): Promise<SeedFilm[]> {
  try {
    const res = await fetch(`${BASE}/api/tmdb/onboarding-seed`, {
      headers: await getAuthHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    return (await res.json()) as SeedFilm[];
  } catch {
    return [];
  }
}

async function saveSeenFilm(film: SeedFilm): Promise<boolean> {
  try {
    const body: Record<string, unknown> = {
      title: film.title,
      status: "watched",
      tmdbId: film.tmdbId,
    };
    if (film.posterPath) body.posterPath = film.posterPath;
    if (film.releaseYear != null) body.releaseYear = film.releaseYear;
    if (film.originalLanguage) body.originalLanguage = film.originalLanguage;
    if (film.overview) body.overview = film.overview;
    if (film.genres?.length) body.genres = film.genres;

    const res = await fetch(`${BASE}/api/movies`, {
      method: "POST",
      headers: await getAuthHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(body),
    });
    return res.status === 201 || res.status === 409;
  } catch {
    return false;
  }
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-lg mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="space-y-8"
      >
        <div className="space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white text-black flex items-center justify-center">
            <Film className="w-6 h-6" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            That&apos;s good! You&apos;ve taken your first step into a larger world…
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Cinevault is your personal cinema vault — track what you watch, get
            recommendations that fit, rate films in your own words, and decide
            together when you can&apos;t pick tonight.
          </p>
        </div>

        <ul className="space-y-4">
          {VALUE_PROPS.map(({ icon: Icon, title, desc }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              className="flex gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </motion.li>
          ))}
        </ul>

        <div className="pt-2 space-y-3">
          <Button
            size="lg"
            className="w-full h-12 bg-white text-black hover:bg-white/90 gap-2 text-base"
            onClick={onNext}
          >
            Let&apos;s build your vault
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            About a minute — you can skip any step
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function SeedStep({
  films,
  loading,
  selected,
  onToggle,
  onContinue,
  onSkip,
  saving,
}: {
  films: SeedFilm[];
  loading: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onContinue: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 pt-8 pb-4 max-w-3xl mx-auto w-full space-y-2 shrink-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Step 2 of 3 · Seed your history
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Tell us what you&apos;ve seen
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          Tap the posters you know. We&apos;ll add them to Watched so your profile
          isn&apos;t empty on day one — recommendations get smarter from the start.
        </p>
        {selected.size > 0 && (
          <p className="text-xs text-foreground/80 pt-1">
            {selected.size} selected
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 pb-4">
        {loading ? (
          <div className="flex justify-center py-20 text-muted-foreground">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : films.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-16 px-6">
            Couldn&apos;t load popular titles right now. Skip and set languages instead.
          </p>
        ) : (
          <div className="max-w-3xl mx-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 sm:gap-2">
            {films.map((film) => {
              const active = selected.has(film.tmdbId);
              const poster = getPosterUrl(film.posterPath);
              return (
                <button
                  key={film.tmdbId}
                  type="button"
                  onClick={() => onToggle(film.tmdbId)}
                  className={cn(
                    "relative aspect-[2/3] overflow-hidden rounded-md bg-secondary/60 transition-all",
                    active
                      ? "ring-2 ring-white scale-[0.98]"
                      : "opacity-90 hover:opacity-100",
                  )}
                  aria-pressed={active}
                  title={film.title}
                >
                  {poster ? (
                    <img
                      src={poster}
                      alt={film.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground p-1 text-center">
                      {film.title}
                    </div>
                  )}
                  <div
                    className={cn(
                      "absolute inset-0 transition-colors",
                      active ? "bg-black/35" : "bg-transparent",
                    )}
                  />
                  {active && (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center shadow">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 max-w-3xl mx-auto w-full shrink-0">
        <button
          type="button"
          onClick={onSkip}
          disabled={saving}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <Button
          onClick={onContinue}
          disabled={saving}
          className="bg-white text-black hover:bg-white/90 gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : selected.size > 0 ? (
            <>Continue · {selected.size} seen</>
          ) : (
            <>Continue</>
          )}
        </Button>
      </div>
    </div>
  );
}

function PrefsStep({
  languages,
  genres,
  onToggleLanguage,
  onToggleGenre,
  onContinue,
  onSkip,
  isPending,
}: {
  languages: string[];
  genres: string[];
  onToggleLanguage: (code: string) => void;
  onToggleGenre: (name: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Step 3 of 3 · Taste prefs
            </p>
            <h1 className="text-2xl font-bold tracking-tight">What do you like watching?</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              Pick languages and genres you enjoy. Your first swipe deck will lean on this —
              change anytime in Profile.
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Languages
            </h2>
            <LanguagePicker selected={languages} onToggle={onToggleLanguage} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Genres
            </h2>
            <GenrePicker selected={genres} onToggle={onToggleGenre} />
          </section>
        </div>
      </div>

      <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 max-w-2xl mx-auto w-full">
        <button
          type="button"
          onClick={onSkip}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <Button
          onClick={onContinue}
          disabled={isPending}
          className="bg-white text-black hover:bg-white/90"
        >
          {isPending ? "Saving…" : "Continue to Swipe"}
        </Button>
      </div>
    </div>
  );
}

/** Multi-step onboarding: welcome → seed posters → language/genre prefs. */
export function OnboardingPreferences({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [seedFilms, setSeedFilms] = useState<SeedFilm[]>([]);
  const [seedLoading, setSeedLoading] = useState(false);
  const [selectedSeen, setSelectedSeen] = useState<Set<number>>(new Set());
  const [savingSeen, setSavingSeen] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const { mutate: savePrefs, isPending } = useSavePreferences();

  useEffect(() => {
    if (step !== "seed" || seedFilms.length > 0 || seedLoading) return;
    setSeedLoading(true);
    void fetchSeedMovies()
      .then(setSeedFilms)
      .finally(() => setSeedLoading(false));
  }, [step, seedFilms.length, seedLoading]);

  const filmById = useMemo(() => {
    const map = new Map<number, SeedFilm>();
    for (const f of seedFilms) map.set(f.tmdbId, f);
    return map;
  }, [seedFilms]);

  const toggleSeen = (id: number) => {
    setSelectedSeen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finishPrefs = (langs: string[], gens: string[]) => {
    savePrefs(
      { preferredLanguages: langs, preferredGenres: gens },
      {
        onSuccess: () => onComplete(),
        onError: (err) => {
          if (err instanceof PreferencesAuthError) {
            toast.error("Session expired — please refresh the page to sign in again", {
              duration: 6000,
            });
          } else {
            toast.error("Couldn't save your preferences — try again");
          }
        },
      },
    );
  };

  const saveSeenAndContinue = async () => {
    if (selectedSeen.size === 0) {
      setStep("prefs");
      return;
    }
    setSavingSeen(true);
    let ok = 0;
    for (const id of selectedSeen) {
      const film = filmById.get(id);
      if (!film) continue;
      if (await saveSeenFilm(film)) ok += 1;
    }
    setSavingSeen(false);
    if (ok > 0) {
      toast.success(`Added ${ok} film${ok === 1 ? "" : "s"} to Watched`);
    }
    setStep("prefs");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <motion.div
            key="welcome"
            className="flex-1 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <WelcomeStep onNext={() => setStep("seed")} />
          </motion.div>
        )}
        {step === "seed" && (
          <motion.div
            key="seed"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
          >
            <SeedStep
              films={seedFilms}
              loading={seedLoading}
              selected={selectedSeen}
              onToggle={toggleSeen}
              onContinue={() => void saveSeenAndContinue()}
              onSkip={() => setStep("prefs")}
              saving={savingSeen}
            />
          </motion.div>
        )}
        {step === "prefs" && (
          <motion.div
            key="prefs"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
          >
            <PrefsStep
              languages={languages}
              genres={genres}
              onToggleLanguage={(code) =>
                setLanguages((prev) =>
                  prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
                )
              }
              onToggleGenre={(name) =>
                setGenres((prev) =>
                  prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name],
                )
              }
              onContinue={() => finishPrefs(languages, genres)}
              onSkip={() => finishPrefs([], [])}
              isPending={isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
