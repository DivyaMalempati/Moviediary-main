import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/lib/preferences";
import {
  FEATURE_TOUR_STEPS,
  isFeatureTourDone,
  markFeatureTourDone,
  resetFeatureTour,
} from "@/lib/feature-guide";
import { useFeatureTour } from "@/components/feature-tour-context";
import { cn } from "@/lib/utils";

type Rect = { top: number; left: number; width: number; height: number };

function readTargetRect(target: string): Rect | null {
  const nodes = document.querySelectorAll(`[data-tour="${target}"]`);
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      continue;
    }
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

function useSpotlightRect(target: string, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }

    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      setRect(readTargetRect(target));
    };

    update();
    // Nav may paint after route change — retry briefly.
    const times = [50, 150, 350, 700];
    const timers = times.map((ms) => window.setTimeout(update, ms));

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target, active]);

  return rect;
}

/** Spotlight coach-mark tour that points at real nav icons. */
export function FeatureWalkthrough() {
  const [, setLocation] = useLocation();
  const { open, step, setStep, closeTour } = useFeatureTour();
  const total = FEATURE_TOUR_STEPS.length;
  const current = FEATURE_TOUR_STEPS[Math.min(step, total - 1)];
  const isLast = step >= total - 1;
  const rect = useSpotlightRect(current.target, open);
  const pad = 8;

  // Navigate so the highlighted destination is on screen.
  useEffect(() => {
    if (!open) return;
    setLocation(current.href);
  }, [open, current.href, setLocation]);

  const finish = useCallback(
    (goHref?: string) => {
      markFeatureTourDone();
      closeTour(true);
      if (goHref) setLocation(goHref);
    },
    [closeTour, setLocation],
  );

  const skip = () => finish();

  // Tooltip placement: above bottom-nav targets, otherwise below/right of hole.
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const tipAbove = rect ? rect.top + rect.height / 2 > viewportH * 0.55 : true;

  const hole = rect
    ? {
        top: Math.max(4, rect.top - pad),
        left: Math.max(4, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="App walkthrough">
      {/* Dim overlay with spotlight cutout via box-shadow */}
      <div
        className="absolute inset-0"
        onClick={skip}
        aria-hidden
      >
        {hole ? (
          <motion.div
            className="absolute rounded-2xl"
            initial={false}
            animate={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
              outline: "2px solid rgba(255,255,255,0.85)",
              outlineOffset: 2,
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/72" />
        )}
      </div>

      {/* Pulse ring on the target */}
      {hole && (
        <motion.div
          className="pointer-events-none absolute rounded-2xl border-2 border-white/70"
          animate={{
            top: hole.top - 4,
            left: hole.left - 4,
            width: hole.width + 8,
            height: hole.height + 8,
            opacity: [0.95, 0.35, 0.95],
            scale: [1, 1.04, 1],
          }}
          transition={{
            opacity: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
            scale: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
            top: { type: "spring", stiffness: 380, damping: 32 },
            left: { type: "spring", stiffness: 380, damping: 32 },
            width: { type: "spring", stiffness: 380, damping: 32 },
            height: { type: "spring", stiffness: 380, damping: 32 },
          }}
        />
      )}

      {/* Coach-mark bubble */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          className={cn(
            "absolute z-[210] w-[min(20.5rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-background px-4 py-3.5 shadow-2xl",
            !hole && "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          )}
          style={
            hole
              ? tipAbove
                ? {
                    left: Math.min(
                      Math.max(16, hole.left + hole.width / 2 - 160),
                      (typeof window !== "undefined" ? window.innerWidth : 400) - 16 - 328,
                    ),
                    bottom: viewportH - hole.top + 14,
                  }
                : {
                    left: Math.min(
                      Math.max(16, hole.left + hole.width / 2 - 160),
                      (typeof window !== "undefined" ? window.innerWidth : 400) - 16 - 328,
                    ),
                    top: hole.top + hole.height + 14,
                  }
              : undefined
          }
          initial={{ opacity: 0, y: tipAbove ? 10 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: tipAbove ? -8 : 8 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {step + 1} / {total}
          </p>
          <h3 className="text-base font-semibold mt-1">{current.title}</h3>
          <p className="text-sm text-foreground/85 mt-1.5 leading-snug">{current.tip}</p>

          <div className="mt-3 flex items-center gap-1.5">
            {FEATURE_TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i <= step ? "bg-white" : "bg-white/15",
                )}
              />
            ))}
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-8 px-2"
              onClick={skip}
            >
              Skip
            </Button>
            <div className="flex-1" />
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            {!isLast ? (
              <Button
                size="sm"
                className="h-8 bg-white text-black hover:bg-white/90"
                onClick={() => setStep(step + 1)}
              >
                Next
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 bg-white text-black hover:bg-white/90"
                onClick={() => finish(current.href)}
              >
                {current.cta ?? "Done"}
              </Button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Auto-opens the spotlight walkthrough once after taste onboarding.
 * Mount once at App root (not inside per-page Layout).
 */
export function FeatureWalkthroughHost() {
  const { data: prefs, isLoading } = usePreferences();
  const { open, openTour } = useFeatureTour();

  useEffect(() => {
    if (isLoading) return;
    if (!prefs?.onboardingCompletedAt) return;
    if (isFeatureTourDone()) return;
    if (open) return;
    const t = window.setTimeout(() => openTour(0), 700);
    return () => window.clearTimeout(t);
  }, [isLoading, prefs?.onboardingCompletedAt, open, openTour]);

  return <FeatureWalkthrough />;
}

/** Opens the tour again (e.g. from Profile / Guide). */
export function useReplayFeatureTour() {
  const { openTour } = useFeatureTour();
  const replay = useCallback(() => {
    resetFeatureTour();
    openTour(0);
  }, [openTour]);
  return { replay };
}
