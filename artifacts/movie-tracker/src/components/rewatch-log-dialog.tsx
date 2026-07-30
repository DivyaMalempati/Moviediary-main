import { useState, useEffect } from "react";
import { Heart, Star } from "lucide-react";
import { RATING_LABELS } from "@/lib/movie-utils";
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
  /** ISO date (YYYY-MM-DD) when set; omit/null to skip date logging. */
  watchedAt?: string | null;
};

interface RewatchLogDialogProps {
  open: boolean;
  movieTitle: string;
  onConfirm: (payload: RewatchLogPayload) => void;
  onCancel: () => void;
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Log a rewatch with optional rating and optional watch date. */
export function RewatchLogDialog({
  open,
  movieTitle,
  onConfirm,
  onCancel,
}: RewatchLogDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [logDate, setLogDate] = useState(false);
  const [watchedAt, setWatchedAt] = useState(todayInputValue);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setLogDate(false);
      setWatchedAt(todayInputValue());
    }
  }, [open, movieTitle]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onCancel();
  };

  const submit = (rating: string | null) => {
    onConfirm({
      rating,
      watchedAt: logDate && watchedAt ? watchedAt : null,
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
                Rewatch date{" "}
                <span className="text-muted-foreground/70">(optional)</span>
              </Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setLogDate((v) => !v)}
              >
                {logDate ? "Clear date" : "Add date"}
              </button>
            </div>
            {logDate && (
              <Input
                id="rewatch-date"
                type="date"
                value={watchedAt}
                max={todayInputValue()}
                onChange={(e) => setWatchedAt(e.target.value)}
                className="bg-secondary border-border"
              />
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
