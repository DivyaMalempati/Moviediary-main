import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clapperboard, ArrowRight, ArrowLeft, Loader2,
  Film, Heart, CheckCircle2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSavePreferences } from "@/lib/preferences";
import { toast } from "sonner";

// ── Language catalogue — Indian cinema first ─────────────────────────────────
const LANGUAGE_GROUPS = [
  {
    label: "Indian cinema",
    featured: true,
    langs: [
      { code: "hi", name: "Hindi",     flag: "🇮🇳" },
      { code: "te", name: "Telugu",    flag: "🇮🇳" },
      { code: "ta", name: "Tamil",     flag: "🇮🇳" },
      { code: "ml", name: "Malayalam", flag: "🇮🇳" },
      { code: "kn", name: "Kannada",   flag: "🇮🇳" },
      { code: "bn", name: "Bengali",   flag: "🇮🇳" },
      { code: "mr", name: "Marathi",   flag: "🇮🇳" },
      { code: "pa", name: "Punjabi",   flag: "🇮🇳" },
    ],
  },
  {
    label: "East Asian",
    featured: false,
    langs: [
      { code: "ko", name: "Korean",   flag: "🇰🇷" },
      { code: "ja", name: "Japanese", flag: "🇯🇵" },
      { code: "zh", name: "Chinese",  flag: "🇨🇳" },
    ],
  },
  {
    label: "Western",
    featured: false,
    langs: [
      { code: "en", name: "English", flag: "🇺🇸" },
      { code: "fr", name: "French",  flag: "🇫🇷" },
      { code: "es", name: "Spanish", flag: "🇪🇸" },
      { code: "de", name: "German",  flag: "🇩🇪" },
      { code: "it", name: "Italian", flag: "🇮🇹" },
    ],
  },
  {
    label: "Middle Eastern & Other",
    featured: false,
    langs: [
      { code: "ar", name: "Arabic",   flag: "🇸🇦" },
      { code: "fa", name: "Persian",  flag: "🇮🇷" },
      { code: "tr", name: "Turkish",  flag: "🇹🇷" },
    ],
  },
];

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "Horror",
  "Mystery", "Romance", "Science Fiction", "Thriller",
];

const ALL_INDIAN = LANGUAGE_GROUPS[0].langs.map((l) => l.code);

// ── Step slide variants ───────────────────────────────────────────────────────
const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? "60%" : "-60%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? "-60%" : "60%", opacity: 0 }),
};

const TOTAL_STEPS = 4; // 0=welcome 1=languages 2=genres 3=ready

// ── Progress dots ─────────────────────────────────────────────────────────────
function ProgressDots({ step }: { step: number }) {
  // Steps 1-3 show dots (welcome has no dots)
  if (step === 0) return null;
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={cn(
            "rounded-full transition-all duration-300",
            s < step
              ? "w-5 h-1.5 bg-white"
              : s === step
                ? "w-5 h-1.5 bg-white"
                : "w-1.5 h-1.5 bg-white/20",
          )}
        />
      ))}
    </div>
  );
}

// ── Step 0 — Welcome ──────────────────────────────────────────────────────────
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-8 max-w-sm mx-auto">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
        className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mb-8 shadow-2xl shadow-white/10"
      >
        <Clapperboard className="w-10 h-10 text-black" />
      </motion.div>

      <motion.h1
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-3xl font-bold tracking-tight mb-4"
      >
        Welcome to Cinevault
      </motion.h1>

      <motion.p
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground text-sm leading-relaxed mb-10"
      >
        Your personal world cinema tracker. We'll ask two quick questions to set up
        your taste profile — then drop you straight into Discover.
      </motion.p>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="w-full space-y-3"
      >
        <Button
          size="lg"
          className="bg-white text-black hover:bg-white/90 w-full gap-2 h-12 text-base"
          onClick={onNext}
        >
          Set up my vault <ArrowRight className="w-4 h-4" />
        </Button>
        <p className="text-xs text-muted-foreground">Takes about 30 seconds</p>
      </motion.div>
    </div>
  );
}

// ── Step 1 — Languages ────────────────────────────────────────────────────────
function LanguagesStep({
  selected,
  onToggle,
  onToggleGroup,
}: {
  selected: Set<string>;
  onToggle: (code: string) => void;
  onToggleGroup: (codes: string[]) => void;
}) {
  return (
    <div className="max-w-xl mx-auto px-5 pb-6 space-y-7">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">What cinema do you love?</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Pick the languages you enjoy. Discover and Suggestions will prioritise these —
          you can change them any time.
        </p>
      </div>

      <div className="space-y-6">
        {LANGUAGE_GROUPS.map((group) => {
          const codes = group.langs.map((l) => l.code);
          const allOn = codes.every((c) => selected.has(c));
          const someOn = codes.some((c) => selected.has(c));
          return (
            <div key={group.label}>
              <div className="flex items-center justify-between mb-3">
                <p className={cn(
                  "text-xs font-semibold uppercase tracking-widest",
                  group.featured ? "text-foreground" : "text-muted-foreground",
                )}>
                  {group.label}
                </p>
                <button
                  onClick={() => onToggleGroup(codes)}
                  className={cn(
                    "text-[11px] font-medium transition-colors",
                    allOn  ? "text-white/60 hover:text-white/40"
                    : someOn ? "text-white/50 hover:text-white"
                             : "text-white/40 hover:text-white/70",
                  )}
                >
                  {allOn ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.langs.map(({ code, name, flag }) => {
                  const active = selected.has(code);
                  return (
                    <button
                      key={code}
                      onClick={() => onToggle(code)}
                      className={cn(
                        "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all",
                        active
                          ? group.featured
                            ? "bg-white text-black border-white"
                            : "bg-white/15 text-white border-white/40"
                          : "bg-transparent text-muted-foreground border-border hover:border-white/30 hover:text-foreground",
                      )}
                    >
                      <span className="text-base leading-none">{flag}</span>
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2 — Genres ───────────────────────────────────────────────────────────
function GenresStep({
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  selected: Set<string>;
  onToggle: (genre: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto px-5 pb-6 space-y-7">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Any favourite genres?</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Optional — helps personalise Discover from your very first swipe,
          before you've logged any films.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Genres
          </span>
          <div className="flex items-center gap-3">
            {selected.size < GENRES.length && (
              <button onClick={onSelectAll} className="text-[11px] font-medium text-white/40 hover:text-white/70 transition-colors">
                Select all
              </button>
            )}
            {selected.size > 0 && (
              <button onClick={onClear} className="text-[11px] font-medium text-white/60 hover:text-white/40 transition-colors">
                Clear all
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((genre) => {
            const active = selected.has(genre);
            return (
              <button
                key={genre}
                onClick={() => onToggle(genre)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-sm font-medium border transition-all",
                  active
                    ? "bg-white/15 text-white border-white/40"
                    : "bg-transparent text-muted-foreground border-border hover:border-white/30 hover:text-foreground",
                )}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 3 — All set ──────────────────────────────────────────────────────────
function ReadyStep({ langCount, genreCount }: { langCount: number; genreCount: number }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-4 max-w-sm mx-auto">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-6"
      >
        <CheckCircle2 className="w-8 h-8 text-white" />
      </motion.div>

      <motion.h2
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-2xl font-bold mb-2"
      >
        Your vault is ready
      </motion.h2>

      <motion.p
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-sm leading-relaxed mb-6"
      >
        {langCount} {langCount === 1 ? "language" : "languages"} selected
        {genreCount > 0 ? ` · ${genreCount} ${genreCount === 1 ? "genre" : "genres"}` : ""}.
        {" "}Discover will start showing personalised picks right away.
      </motion.p>

      {/* Gesture preview */}
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="w-full rounded-2xl border border-border/50 bg-white/5 p-5 mb-8"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">
          How Discover works
        </p>
        <div className="space-y-3">
          {[
            { icon: X,            color: "text-rose-400",    label: "Swipe left",  desc: "Skip this film"          },
            { icon: Heart,        color: "text-emerald-400", label: "Swipe right", desc: "Save to your watchlist"  },
            { icon: CheckCircle2, color: "text-blue-400",    label: "Swipe up",    desc: "Log it as already watched" },
          ].map(({ icon: Icon, color, label, desc }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-white/5 shrink-0", color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-xs font-semibold text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground ml-1.5">— {desc}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ── Main onboarding page ──────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { mutate: savePrefs, isPending } = useSavePreferences();

  const [step, setStep] = useState(0);
  const [dir,  setDir]  = useState(1); // 1 = forward, -1 = backward

  const [selectedLangs,   setSelectedLangs]   = useState<Set<string>>(new Set(ALL_INDIAN));
  const [selectedGenres,  setSelectedGenres]   = useState<Set<string>>(new Set());

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goTo = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  // ── Language toggles ────────────────────────────────────────────────────────
  const toggleLang = (code: string) =>
    setSelectedLangs((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  const toggleLangGroup = (codes: string[]) => {
    const allOn = codes.every((c) => selectedLangs.has(c));
    setSelectedLangs((prev) => {
      const next = new Set(prev);
      if (allOn) codes.forEach((c) => next.delete(c));
      else       codes.forEach((c) => next.add(c));
      return next;
    });
  };

  // ── Genre toggles ───────────────────────────────────────────────────────────
  const toggleGenre = (g: string) =>
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  // ── Save + navigate ─────────────────────────────────────────────────────────
  const handleFinish = () => {
    savePrefs(
      {
        preferredLanguages: [...selectedLangs],
        preferredGenres:    [...selectedGenres],
      },
      {
        onSuccess: () => setLocation("/swipe"),
        onError: () => {
          toast.error("Couldn't save preferences — you can update them from the settings icon");
          setLocation("/swipe");
        },
      },
    );
  };

  const handleSkip = () => setLocation("/watched");

  // ── Footer config per step ──────────────────────────────────────────────────
  const footerConfig = {
    0: null, // welcome handles its own CTA
    1: {
      back: null,
      next: { label: "Next", action: () => goTo(2) },
      skip: { label: "Skip for now", action: handleSkip },
      count: `${selectedLangs.size} selected`,
    },
    2: {
      back: { label: "Back", action: () => goTo(1) },
      next: { label: "Next", action: () => goTo(3) },
      skip: { label: "Skip genres", action: () => goTo(3) },
      count: selectedGenres.size > 0 ? `${selectedGenres.size} selected` : "Optional",
    },
    3: {
      back: { label: "Back", action: () => goTo(2) },
      next: { label: isPending ? "Saving…" : "Start discovering", action: handleFinish, primary: true },
      skip: null,
      count: null,
    },
  }[step];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold text-xl tracking-tight">Cinevault</span>
        </div>
        {step > 0 && step < 3 && (
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip setup
          </button>
        )}
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto relative">
        {/* Progress dots — inside scroll area so they stay near content */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm pt-6 pb-2">
          <ProgressDots step={step} />
        </div>

        {/* Step content with slide animation */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              {step === 0 && <WelcomeStep onNext={() => goTo(1)} />}
              {step === 1 && (
                <LanguagesStep
                  selected={selectedLangs}
                  onToggle={toggleLang}
                  onToggleGroup={toggleLangGroup}
                />
              )}
              {step === 2 && (
                <GenresStep
                  selected={selectedGenres}
                  onToggle={toggleGenre}
                  onSelectAll={() => setSelectedGenres(new Set(GENRES))}
                  onClear={() => setSelectedGenres(new Set())}
                />
              )}
              {step === 3 && (
                <ReadyStep
                  langCount={selectedLangs.size}
                  genreCount={selectedGenres.size}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer — hidden on welcome step (step 0 has its own CTA) */}
      {footerConfig && (
        <div className="border-t border-border/40 px-5 py-4 bg-background shrink-0">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            {/* Back */}
            {footerConfig.back ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground gap-1.5"
                onClick={footerConfig.back.action}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {footerConfig.back.label}
              </Button>
            ) : (
              <div />
            )}

            <div className="flex-1" />

            {/* Selection count */}
            {footerConfig.count && (
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                {footerConfig.count}
              </span>
            )}

            {/* Skip */}
            {footerConfig.skip && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={footerConfig.skip.action}
                disabled={isPending}
              >
                {footerConfig.skip.label}
              </Button>
            )}

            {/* Next / Finish */}
            <Button
              size="sm"
              className={cn(
                "gap-2 min-w-[140px]",
                step === 3
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/20",
              )}
              onClick={footerConfig.next.action}
              disabled={isPending}
            >
              {isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <>
                  {footerConfig.next.label}
                  {step < 3 ? <ArrowRight className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
