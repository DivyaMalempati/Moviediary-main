import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Share2,
  Copy,
  ExternalLink,
  MessageCircle,
  Download,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  downloadShareCard,
  facebookShareUrl,
  nativeShareMovie,
  renderMovieShareCard,
  twitterShareUrl,
  whatsappShareUrl,
  type ShareMovieInput,
} from "@/lib/share-movie";
import { RATING_LABELS, getPosterUrl } from "@/lib/movie-utils";
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

  const text = useMemo(() => buildMovieShareText(movie), [movie]);
  const posterUrl = getPosterUrl(movie.posterPath, "w500");
  const ratingLabel =
    movie.rating && RATING_LABELS[movie.rating] ? RATING_LABELS[movie.rating] : null;

  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setRendering(true);
    void renderMovieShareCard(movie)
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
  }, [open, movie]);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const handleNative = async () => {
    const result = await nativeShareMovie(text, movie.title, cardBlob);
    if (result === "shared") {
      setOpen(false);
      toast.success(cardBlob ? "Shared poster + review" : "Shared");
      return;
    }
    if (result === "cancelled") return;
    toast.message("Save the poster below, or copy the caption");
  };

  const handleCopy = async () => {
    const ok = await copyShareText(text);
    if (ok) {
      toast.success("Caption copied — attach the poster when you post");
    } else {
      toast.error("Couldn’t copy caption");
    }
  };

  const handleDownload = () => {
    if (!cardBlob) {
      toast.error("Poster isn’t ready yet");
      return;
    }
    downloadShareCard(cardBlob, movie.title);
    toast.success("Poster saved — share it with your caption");
  };

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
            A small post card with the poster and your review — share the image to WhatsApp,
            Instagram, or Messages.
          </SheetDescription>
        </SheetHeader>

        {/* Live preview of the social post */}
        <div className="mt-4 mx-auto w-full max-w-[280px] rounded-2xl overflow-hidden border border-white/10 bg-[#121212] shadow-lg">
          <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.2em] text-white/45">
            Cinevault
          </div>
          <div className="px-3">
            <div className="aspect-[2/3] rounded-xl overflow-hidden bg-secondary/60">
              {posterUrl ? (
                <img src={posterUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="w-8 h-8" />
                </div>
              )}
            </div>
          </div>
          <div className="px-3 py-3 space-y-1.5">
            <p className="text-sm font-semibold text-white leading-snug">
              {movie.title}
              {movie.releaseYear ? (
                <span className="text-white/50 font-normal"> ({movie.releaseYear})</span>
              ) : null}
            </p>
            <p className="text-[11px] text-white/65">
              {[
                movie.isRewatch ? "Rewatch" : "Watched",
                movie.isRewatch && movie.timesSeen && movie.timesSeen > 1
                  ? `×${movie.timesSeen}`
                  : null,
                ratingLabel,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {movie.notes?.trim() ? (
              <p className="text-xs text-white/85 italic leading-relaxed pt-1">
                “{movie.notes.trim()}”
              </p>
            ) : null}
          </div>
        </div>

        {rendering && (
          <p className="mt-3 text-center text-xs text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing share image…
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            className="gap-2 col-span-2 bg-white text-black hover:bg-white/90"
            onClick={() => void handleNative()}
            disabled={rendering}
          >
            <Share2 className="w-4 h-4" />
            Share poster
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={handleDownload}
            disabled={!cardBlob || rendering}
          >
            <Download className="w-4 h-4" />
            Save image
          </Button>
          <Button variant="secondary" className="gap-2" onClick={() => void handleCopy()}>
            <Copy className="w-4 h-4" />
            Copy caption
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => openExternal(whatsappShareUrl(text))}
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp text
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => openExternal(twitterShareUrl(text))}
          >
            <ExternalLink className="w-4 h-4" />
            X caption
          </Button>
        </div>

        {cardUrl && (
          <p className="mt-3 text-[11px] text-muted-foreground text-center">
            Tip: on phone, <span className="text-foreground">Share poster</span> sends the image.
            On desktop, save the image then attach it.
          </p>
        )}

        {/* Keep Facebook as secondary text path */}
        <button
          type="button"
          className="mt-2 w-full text-center text-[11px] text-muted-foreground underline"
          onClick={() => openExternal(facebookShareUrl(text))}
        >
          Open Facebook with caption
        </button>
      </SheetContent>
    </Sheet>
  );
}
