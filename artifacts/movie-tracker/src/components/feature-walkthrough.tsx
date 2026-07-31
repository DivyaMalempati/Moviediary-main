import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/lib/preferences";
import {
  FEATURE_TOUR_STEPS,
  isFeatureTourDone,
  markFeatureTourDone,
  resetFeatureTour,
} from "@/lib/feature-guide";
import { cn } from "@/lib/utils";

type FeatureWalkthroughProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Interactive multi-step tour of Cinevault’s main features. */
export function FeatureWalkthrough({ open, onOpenChange }: FeatureWalkthroughProps) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const total = FEATURE_TOUR_STEPS.length;
  const current = FEATURE_TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === total - 1;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const finish = useCallback(
    (href?: string) => {
      markFeatureTourDone();
      onOpenChange(false);
      if (href) setLocation(href);
    },
    [onOpenChange, setLocation],
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) markFeatureTourDone();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-background border-border gap-0 overflow-hidden p-0">
        <div className="relative px-6 pt-6 pb-4">
          <DialogHeader className="space-y-1 pr-6">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Feature walkthrough · {step + 1}/{total}
            </p>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Your Cinevault guide
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              What each main page and button does — skip anytime; reopen from Profile → Guide.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex gap-1.5">
            {FEATURE_TOUR_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                onClick={() => setStep(i)}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-white" : "bg-white/15",
                )}
              />
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 min-h-[220px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="space-y-4"
            >
              <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{current.title}</h3>
                <p className="text-sm text-foreground/80 mt-1">{current.summary}</p>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  {current.detail}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-border bg-secondary/20">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => finish()}
          >
            Skip
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {!isLast ? (
            <Button size="sm" className="bg-white text-black hover:bg-white/90" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-white text-black hover:bg-white/90"
              onClick={() => finish(current.href)}
            >
              {current.cta}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Auto-opens the walkthrough once after taste onboarding is complete.
 * Mount inside Layout so it works on any authenticated page.
 */
export function FeatureWalkthroughHost() {
  const { data: prefs, isLoading } = usePreferences();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!prefs?.onboardingCompletedAt) return;
    if (isFeatureTourDone()) return;
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [isLoading, prefs?.onboardingCompletedAt]);

  return <FeatureWalkthrough open={open} onOpenChange={setOpen} />;
}

/** Opens the tour again (e.g. from Profile / Guide). */
export function useReplayFeatureTour() {
  const [open, setOpen] = useState(false);
  const replay = useCallback(() => {
    resetFeatureTour();
    setOpen(true);
  }, []);
  return {
    open,
    setOpen,
    replay,
    dialog: <FeatureWalkthrough open={open} onOpenChange={setOpen} />,
  };
}
