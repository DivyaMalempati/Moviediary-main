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

interface RatingPickerDialogProps {
  open: boolean;
  movieTitle: string;
  onConfirm: (rating: string | null) => void;
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
}

export function RatingPickerDialog({
  open,
  movieTitle,
  onConfirm,
  onCancel,
  confirmOnSelect = true,
  titleSuffix = "",
  skipLabel,
}: RatingPickerDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Fresh selection every time the dialog opens for a film.
  useEffect(() => {
    if (open) setSelected(null);
  }, [open, movieTitle]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onCancel();
  };

  const handleConfirm = () => {
    onConfirm(selected);
    setSelected(null);
  };

  const handleSkip = () => {
    onConfirm(null);
    setSelected(null);
  };

  const handleSelect = (val: string) => {
    if (confirmOnSelect) {
      onConfirm(val);
      setSelected(null);
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

        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(RATING_LABELS).map(([val, label]) => {
            const isSelected = selected === val;
            const isLoved = val === "loved";
            return (
              <button
                key={val}
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
