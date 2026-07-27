import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LanguagePicker, GenrePicker } from "@/components/taste-picker";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import { toast } from "sonner";

export function PreferencesModal() {
  const [open, setOpen] = useState(false);
  const { data: prefs, isLoading } = usePreferences();
  const { mutate: savePrefs, isPending } = useSavePreferences();
  const [languages, setLanguages] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);

  const handleOpen = (val: boolean) => {
    if (val && prefs) {
      setLanguages(prefs.preferredLanguages ?? []);
      setGenres(prefs.preferredGenres ?? []);
    }
    setOpen(val);
  };

  const toggleLanguage = (code: string) =>
    setLanguages((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const toggleGenre = (name: string) =>
    setGenres((prev) => (prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]));

  const handleSave = () => {
    savePrefs(
      { preferredLanguages: languages, preferredGenres: genres },
      {
        onSuccess: () => {
          toast.success("Preferences saved");
          setOpen(false);
        },
        onError: () => toast.error("Failed to save preferences"),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Preferences"
        >
          <Settings className="w-4 h-4" />
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-background border-border overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-border">
          <SheetTitle className="text-base font-semibold">Cinema Preferences</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Languages and genres you enjoy. Swipe, Suggestions, and Discover all prioritise these.
            Leave everything unselected to browse all world cinema.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-12">
            Loading…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
            <section className="space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Languages
              </h3>
              <LanguagePicker selected={languages} onToggle={toggleLanguage} />
            </section>

            <section className="space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Genres
              </h3>
              <GenrePicker selected={genres} onToggle={toggleGenre} />
            </section>
          </div>
        )}

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          {(languages.length > 0 || genres.length > 0) && (
            <button
              onClick={() => {
                setLanguages([]);
                setGenres([]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="bg-white text-black hover:bg-white/90">
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
