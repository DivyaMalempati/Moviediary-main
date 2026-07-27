import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LanguagePicker, GenrePicker } from "@/components/taste-picker";
import { useSavePreferences, PreferencesAuthError } from "@/lib/preferences";
import { toast } from "sonner";
import { Film } from "lucide-react";

export function OnboardingPreferences({ onComplete }: { onComplete: () => void }) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const { mutate: savePrefs, isPending } = useSavePreferences();

  const toggleLanguage = (code: string) =>
    setLanguages((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const toggleGenre = (name: string) =>
    setGenres((prev) => (prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]));

  const handleContinue = () => {
    savePrefs(
      { preferredLanguages: languages, preferredGenres: genres },
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

  const handleSkip = () => {
    // Still save (empty selections) so onboardingCompletedAt gets stamped —
    // otherwise this screen would show every time. Falls back to world
    // cinema / popular+iconic, same as before onboarding existed.
    savePrefs(
      { preferredLanguages: [], preferredGenres: [] },
      { onSuccess: () => onComplete(), onError: () => onComplete() },
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white text-black flex items-center justify-center mx-auto">
              <Film className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold">What do you like watching?</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Pick a few languages and genres you enjoy. Your first swipe deck will be built
              around this — you can always change it later in Profile.
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Languages
            </h2>
            <LanguagePicker selected={languages} onToggle={toggleLanguage} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Genres
            </h2>
            <GenrePicker selected={genres} onToggle={toggleGenre} />
          </section>
        </div>
      </div>

      <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 max-w-2xl mx-auto w-full">
        <button
          onClick={handleSkip}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <Button
          onClick={handleContinue}
          disabled={isPending}
          className="bg-white text-black hover:bg-white/90"
        >
          {isPending ? "Saving…" : "Continue to Discover"}
        </Button>
      </div>
    </div>
  );
}
