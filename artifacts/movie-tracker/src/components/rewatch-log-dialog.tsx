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

export type RewatchLogPayload = {
  rating: string | null;
  /** ISO date (YYYY-MM-DD) when set; null = undated rewatch. */
  watchedAt?: string | null;
};

interface RewatchLogDialogProps {
  open: boolean;
  movieTitle: string;
  onConfirm: (payload: RewatchLogPayload) => void;
  onCancel: () => void;
}

/** Log a rewatch — date defaults to today and can be changed. */
export function RewatchLogDialog({
  open,
  movieTitle,
  onConfirm,
  onCancel,
}: RewatchLogDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [watchedAt, setWatchedAt] = useState(todayInputValue);
  /** When false, rewatch is logged without a date. */
  const [includeDate, setIncludeDate] = useState(true);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setIncludeDate(true);
      setWatchedAt(todayInputValue());
    }
  }, [open, movieTitle]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onCancel();
  };

  const submit = (rating: string | null) => {
    onConfirm({
      rating,
      watchedAt: includeDate && watchedAt ? watchedAt : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm bg-background border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold leading-snug pr-6">
            Log rewatch of{" "}
            <span className="text-primary truncate inline-block max-w-[16rem] align-bottom">
              {movieTitle}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="rewatch-date" className="text-sm text-muted-foreground">
                Rewatch date
              </Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  if (includeDate) {
                    setIncludeDate(false);
                  } else {
                    setIncludeDate(true);
                    setWatchedAt(todayInputValue());
                  }
                }}
              >
                {includeDate ? "Not sure" : "Add date"}
              </button>
            </div>
            {includeDate ? (
              <Input
                id="rewatch-date"
                type="date"
                value={watchedAt}
                max={todayInputValue()}
                onChange={(e) => {
                  const today = todayInputValue();
                  setWatchedAt(e.target.value > today ? today : e.target.value);
                }}
                className="bg-secondary border-border"
              />
            ) : (
              <p className="text-xs text-muted-foreground/80">
                Will log without a date — you can add one later from Watch history.
              </p>
            )}
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">
              How was it this time?{" "}
              <span className="text-muted-foreground/70">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(RATING_LABELS).map(([val, label]) => {
                const isSelected = selected === val;
                const isLoved = val === "loved";
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSelected((prev) => (prev === val ? null : val))}
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
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-muted-foreground"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={() => submit(selected)}
          >
            Log rewatch
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
