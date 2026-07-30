import { useState, type ReactNode } from "react";
import { Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LanguagePicker, GenrePicker, ProviderPicker } from "@/components/taste-picker";
import {
  usePreferences,
  useSavePreferences,
  CERTIFICATION_OPTIONS,
  type MaxCertification,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function PreferencesModal({
  trigger,
}: {
  /** Custom trigger. Defaults to a settings gear icon. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { data: prefs, isLoading, refetch } = usePreferences();
  const { mutate: savePrefs, isPending } = useSavePreferences();
  const [languages, setLanguages] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [providers, setProviders] = useState<number[]>([]);
  const [maxCertification, setMaxCertification] = useState<MaxCertification | null>(null);
  const [mutedGenres, setMutedGenres] = useState<string[]>([]);

  const handleOpen = (val: boolean) => {
    if (val) {
      void refetch().then((result) => {
        const next = result.data ?? prefs;
        setLanguages(next?.preferredLanguages ?? []);
        setGenres(next?.preferredGenres ?? []);
        setProviders(next?.preferredProviders ?? []);
        setMaxCertification(next?.maxCertification ?? null);
        setMutedGenres(next?.mutedGenres ?? []);
      });
    }
    setOpen(val);
  };

  const toggleLanguage = (code: string) =>
    setLanguages((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const toggleGenre = (name: string) =>
    setGenres((prev) => (prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]));

  const toggleProvider = (id: number) =>
    setProviders((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const handleSave = () => {
    savePrefs(
      {
        preferredLanguages: languages,
        preferredGenres: genres,
        preferredProviders: providers,
        watchRegion: prefs?.watchRegion ?? "IN",
        maxCertification,
        mutedGenres,
      },
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
        {trigger ?? (
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Preferences"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-background border-border overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 py-5 border-b border-border">
          <SheetTitle className="text-base font-semibold">Cinema Preferences</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Languages, genres, age rating, and streaming. Swipe and Discover respect what you mute.
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

            <section className="space-y-3">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Age rating
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Limit Discover and Swipe to India CBFC certifications at or below your pick.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {CERTIFICATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setMaxCertification(opt.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                      maxCertification === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
                    )}
                    title={opt.hint}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            {mutedGenres.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Don&apos;t recommend
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Genres you asked us to skip. Remove one to bring it back.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mutedGenres.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setMutedGenres((prev) => prev.filter((x) => x !== g))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-border bg-secondary/40 text-foreground hover:border-rose-400/50 hover:text-rose-200 transition-colors"
                    >
                      {g}
                      <X className="w-3 h-3 opacity-60" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Streaming services
              </h3>
              <ProviderPicker
                selected={providers}
                onToggle={toggleProvider}
                watchRegion={prefs?.watchRegion ?? "IN"}
              />
            </section>
          </div>
        )}

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          {(languages.length > 0 || genres.length > 0 || providers.length > 0 || mutedGenres.length > 0 || maxCertification) && (
            <button
              onClick={() => {
                setLanguages([]);
                setGenres([]);
                setProviders([]);
                setMutedGenres([]);
                setMaxCertification(null);
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
