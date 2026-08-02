import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Share2, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  buildMovieShareText,
  copyShareText,
  DEFAULT_SHARE_INCLUDES,
  downloadShareCard,
  nativeShareMovie,
  renderMovieShareCard,
  type ShareIncludeOptions,
  type ShareMovieInput,
} from "@/lib/share-movie";
import { splitDiaryNote } from "@/lib/diary-notes";
import { RATING_LABELS } from "@/lib/movie-utils";
import { cn } from "@/lib/utils";

type ShareMovieSheetProps = {
  movie: ShareMovieInput;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  className?: string;
  hideTrigger?: boolean;
};

export function ShareMovieSheet({
  movie,
  open: controlledOpen,
  onOpenChange,
  trigger,
  className,
  hideTrigger,
}: ShareMovieSheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const available = useMemo(() => {
    const parts = splitDiaryNote(movie.notes);
    return {
      rating: Boolean(movie.rating && RATING_LABELS[movie.rating]),
      withWho: Boolean(parts.withWho),
      review: Boolean(parts.review),
      streaming: Boolean(movie.streamingOn?.trim()),
      rewatch: Boolean(movie.isRewatch),
    };
  }, [movie]);

  const [include, setInclude] = useState<ShareIncludeOptions>(DEFAULT_SHARE_INCLUDES);

  // When the sheet opens for a film, default-check every field that exists.
  useEffect(() => {
    if (!open) return;
    setInclude({
      rating: available.rating,
      withWho: available.withWho,
      review: available.review,
      streaming: available.streaming,
      rewatch: available.rewatch,
    });
  }, [open, movie.title, available.rating, available.withWho, available.review, available.streaming, available.rewatch]);

  const text = useMemo(
    () => buildMovieShareText(movie, include),
    [movie, include],
  );

  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setRendering(true);
    setCardBlob(null);
    setCardUrl(null);
    void renderMovieShareCard(movie, include)
      .then((blob) => {
        if (cancelled) return;
        setCardBlob(blob);
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setCardUrl(objectUrl);
        } else {
          setCardUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, movie, include]);

  const toggle = (key: keyof ShareIncludeOptions, checked: boolean) => {
    setInclude((prev) => ({ ...prev, [key]: checked }));
  };

  const handleNative = async () => {
    const result = await nativeShareMovie(text, movie.title, cardBlob);
    if (result === "shared") {
      setOpen(false);
      toast.success(cardBlob ? "Shared poster + review" : "Shared");
      return;
    }
    if (result === "cancelled") return;
    toast.message("Save the poster, or copy the caption");
  };

  const handleCopy = async () => {
    const ok = await copyShareText(text);
    if (ok) {
      toast.success("Caption copied");
    } else {
      toast.error("Couldn’t copy caption");
    }
  };

  const handleDownload = async () => {
    if (!cardBlob) {
      toast.error("Poster isn’t ready yet");
      return;
    }
    try {
      const result = await downloadShareCard(cardBlob, movie.title);
      if (result === "shared") {
        toast.success("Use Save Image in the share sheet");
      } else if (result === "opened") {
        toast.success("Poster opened — long-press to save");
      } else {
        toast.success("Poster saved");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Couldn’t save poster — try Share poster instead");
    }
  };

  const options: Array<{
    key: keyof ShareIncludeOptions;
    label: string;
    hint?: string;
  }> = [
    { key: "rating", label: "Rating" },
    { key: "withWho", label: "Watched with", hint: "Who you saw it with" },
    { key: "review", label: "Review", hint: "Your diary note" },
    { key: "streaming", label: "Streaming" },
    { key: "rewatch", label: "Rewatch" },
  ];

  const hasAnyOption = options.some((o) => available[o.key]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button
              variant="outline"
              className={cn("bg-background/50 backdrop-blur", className)}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          )}
        </SheetTrigger>
      )}
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-border bg-background max-h-[90dvh] overflow-y-auto"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">
            {movie.isRewatch ? "Share rewatch" : "Share watched"}
          </SheetTitle>
          <SheetDescription>
            Pick what to include — the preview updates live.
          </SheetDescription>
        </SheetHeader>

        {hasAnyOption && (
          <div className="mt-4 space-y-2.5 rounded-xl border border-border bg-card/40 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Include in share
            </p>
            {options.map((opt) => {
              if (!available[opt.key]) return null;
              const id = `share-include-${opt.key}`;
              return (
                <label
                  key={opt.key}
                  htmlFor={id}
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <Checkbox
                    id={id}
                    checked={include[opt.key]}
                    onCheckedChange={(v) => toggle(opt.key, v === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground/90">{opt.label}</span>
                    {opt.hint && (
                      <span className="block text-[11px] text-muted-foreground">{opt.hint}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {/* WYSIWYG: same JPEG blob that Share poster sends */}
        <div className="mt-4 mx-auto w-full max-w-[240px] rounded-2xl overflow-hidden border border-white/10 bg-[#121214] shadow-lg aspect-[4/5]">
          {cardUrl ? (
            <img src={cardUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>

        {rendering && (
          <p className="mt-3 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing share image…
          </p>
        )}

        <div className="mt-4 px-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
            Caption
          </p>
          <p className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{text}</p>
        </div>

        <div className="mt-5 space-y-2">
          <Button
            className="gap-2 w-full bg-white text-black hover:bg-white/90"
            onClick={() => void handleNative()}
            disabled={rendering || !cardBlob}
          >
            <Share2 className="w-4 h-4" />
            Share poster
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => void handleDownload()}
              disabled={!cardBlob || rendering}
            >
              <Download className="w-4 h-4" />
              Save image
            </Button>
            <Button variant="secondary" className="gap-2" onClick={() => void handleCopy()}>
              <Copy className="w-4 h-4" />
              Copy caption
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
