import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { FeatureFeedbackDialog } from "@/components/feature-feedback-dialog";
import { isFeatureTourDone } from "@/lib/feature-guide";
import { MessageSquareHeart, X } from "lucide-react";

const DISMISS_KEY = "cinevault:feedback-prompt-dismissed-until";
const SUBMITTED_KEY = "cinevault:feedback-submitted-at";

/** Soft prompt cooldown after dismiss (14 days). */
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
/** After a successful submit, wait longer before asking again (60 days). */
const SUBMITTED_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;

function shouldOfferPrompt(): boolean {
  try {
    if (!isFeatureTourDone()) return false;

    const submittedAt = Number(localStorage.getItem(SUBMITTED_KEY) || "0");
    if (submittedAt && Date.now() - submittedAt < SUBMITTED_COOLDOWN_MS) return false;

    const until = Number(localStorage.getItem(DISMISS_KEY) || "0");
    if (until && Date.now() < until) return false;

    return true;
  } catch {
    return false;
  }
}

function snooze(ms: number) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + ms));
  } catch {
    /* ignore */
  }
}

export function markFeedbackSubmitted() {
  try {
    localStorage.setItem(SUBMITTED_KEY, String(Date.now()));
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

const SKIP_PATHS = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/pair",
]);

/**
 * Soft bottom card asking for feature ideas after the walkthrough —
 * never blocks first-run onboarding.
 */
export function FeatureFeedbackPrompt() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const bare = location.split("?")[0] || "/";
    if (SKIP_PATHS.has(bare) || bare.startsWith("/pair/") || bare.startsWith("/sign-")) {
      setVisible(false);
      return;
    }
    if (!shouldOfferPrompt()) {
      setVisible(false);
      return;
    }
    // Delay so it doesn't compete with page chrome / tour finish animation.
    const t = window.setTimeout(() => setVisible(true), 1800);
    return () => window.clearTimeout(t);
  }, [location]);

  if (!visible && !dialogOpen) return null;

  return (
    <>
      {visible && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 inset-x-0 z-40 pointer-events-none px-3 flex justify-center">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-xl px-4 py-3 flex items-start gap-3">
            <MessageSquareHeart className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium leading-snug">
                What do you want from your movie diary?
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Request a feature anytime — we’ll use it to build Cinevault with you.
              </p>
              <div className="flex items-center gap-2 pt-0.5">
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setVisible(false);
                    setDialogOpen(true);
                  }}
                >
                  Share an idea
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => {
                    snooze(DISMISS_MS);
                    setVisible(false);
                  }}
                >
                  Later
                </Button>
              </div>
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-1 shrink-0"
              aria-label="Dismiss"
              onClick={() => {
                snooze(DISMISS_MS);
                setVisible(false);
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <FeatureFeedbackDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        source="prompt"
        onSubmitted={() => {
          markFeedbackSubmitted();
          setVisible(false);
        }}
      />
    </>
  );
}
