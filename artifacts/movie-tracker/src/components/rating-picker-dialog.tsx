import { useState, useEffect } from "react";
import { Heart, Star } from "lucide-react";
import { RATING_LABELS, todayInputValue } from "@/lib/movie-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type WatchLogPayload = {
  rating: string | null;
  /**
   * Actual watch day (`YYYY-MM-DD`), or `null` when the user is not sure.
   * Callers should send this to the API so log-day ≠ watch-day for backfills.
   */
  watchedAt: string | null;
};

type WatchWhen = "today" | "earlier" | "unknown";

interface RatingPickerDialogProps {
  open: boolean;
  movieTitle: string;
  onConfirm: (payload: WatchLogPayload) => void;
  onCancel: () => void;
  /**
   * When true (default), tapping a rating submits immediately.
   * Pass false only for rare two-step flows that still need a confirm button.
   */
  confirmOnSelect?: boolean;
  /** Optional suffix after the title, e.g. " this time". */
  titleSuffix?: string;
  /** Label for the skip action. */
  skipLabel?: string;
  /** Hide the watch-date controls (e.g. rare flows that only need a rating). */
  hideWatchDate?: boolean;
}

export function RatingPickerDialog({
  open,
  movieTitle,
  onConfirm,
  onCancel,
  confirmOnSelect = true,
  titleSuffix = "",
  skipLabel,
  hideWatchDate = false,
}: RatingPickerDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [when, setWhen] = useState<WatchWhen>("today");
  const [earlierDate, setEarlierDate] = useState(todayInputValue);

  // Fresh selection every time the dialog opens for a film.
  useEffect(() => {
    if (open) {
      setSelected(null);
      setWhen("today");
      setEarlierDate(todayInputValue());
    }
  }, [open, movieTitle]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onCancel();
  };

  const resolveWatchedAt = (): string | null => {
    if (hideWatchDate) return todayInputValue();
    if (when === "unknown") return null;
    if (when === "earlier") return earlierDate || todayInputValue();
    return todayInputValue();
  };

  const submit = (rating: string | null) => {
    onConfirm({ rating, watchedAt: resolveWatchedAt() });
    setSelected(null);
  };

  const handleConfirm = () => submit(selected);
  const handleSkip = () => submit(null);

  const handleSelect = (val: string) => {
    if (confirmOnSelect) {
      submit(val);
      return;
    }
    setSelected((prev) => (prev === val ? null : val));
  };

  const resolvedSkip =
    skipLabel ??
    (confirmOnSelect ? "Skip rating · still mark watched" : "Skip rating");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm bg-background border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold leading-snug pr-6">
            How was{" "}
            <span className="text-primary truncate inline-block max-w-[16rem] align-bottom">
              {movieTitle}
            </span>
            {titleSuffix}?
          </DialogTitle>
        </DialogHeader>

        {!hideWatchDate && (
          <div className="space-y-2 mt-1">
            <Label className="text-sm text-muted-foreground">When did you watch?</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["today", "Today"],
                  ["earlier", "Earlier"],
                  ["unknown", "Not sure"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWhen(value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    when === value
                      ? "bg-white text-black shadow-lg shadow-white/10"
                      : "bg-secondary border border-border hover:border-white/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {when === "earlier" && (
              <Input
                type="date"
                value={earlierDate}
                max={todayInputValue()}
                onChange={(e) => setEarlierDate(e.target.value)}
                className="bg-secondary border-border"
              />
            )}
            {when === "unknown" && (
              <p className="text-xs text-muted-foreground">
                Won’t count toward “watched this month” until you set a date later.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(RATING_LABELS).map(([val, label]) => {
            const isSelected = selected === val;
            const isLoved = val === "loved";
            return (
              <button
                key={val}
                type="button"
                onClick={() => handleSelect(val)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-white text-black shadow-lg shadow-white/10"
                    : "bg-secondary border border-border hover:border-white/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                {isLoved ? (
                  <Heart className={`w-3 h-3 ${isSelected ? "fill-black" : ""}`} />
                ) : (
                  <Star className={`w-3 h-3 ${isSelected ? "fill-black" : ""}`} />
                )}
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            className={confirmOnSelect ? "w-full text-muted-foreground" : "flex-1 text-muted-foreground"}
            onClick={handleSkip}
          >
            {resolvedSkip}
          </Button>
          {!confirmOnSelect && (
            <Button
              size="sm"
              className="flex-1"
              disabled={!selected}
              onClick={handleConfirm}
            >
              Mark Watched
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
