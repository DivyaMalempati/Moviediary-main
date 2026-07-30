import { useMemo, useState, type ReactNode } from "react";
import { Share2, Copy, ExternalLink, MessageCircle } from "lucide-react";
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
  facebookShareUrl,
  nativeShareMovie,
  twitterShareUrl,
  whatsappShareUrl,
  type ShareMovieInput,
} from "@/lib/share-movie";
import { cn } from "@/lib/utils";

type ShareMovieSheetProps = {
  movie: ShareMovieInput;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger; defaults to a Share button. */
  trigger?: ReactNode;
  className?: string;
  /** Hide the default trigger when controlling open from outside. */
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

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const handleNative = async () => {
    const result = await nativeShareMovie(text, movie.title);
    if (result === "shared") {
      setOpen(false);
      toast.success("Shared");
      return;
    }
    if (result === "cancelled") return;
    toast.message("Use WhatsApp, X, or Copy below");
  };

  const handleCopy = async () => {
    const ok = await copyShareText(text);
    if (ok) {
      toast.success("Post copied — paste it on your socials");
      setOpen(false);
    } else {
      toast.error("Couldn’t copy — select the text below");
    }
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
      <SheetContent side="bottom" className="rounded-t-2xl border-border bg-background max-h-[85dvh]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">
            {movie.isRewatch ? "Share rewatch" : "Share watched"}
          </SheetTitle>
          <SheetDescription>
            Post your rating{movie.notes?.trim() ? " and review" : ""} to social media or
            Messages.
          </SheetDescription>
        </SheetHeader>

        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-relaxed font-sans">
          {text}
        </pre>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="secondary" className="gap-2" onClick={() => void handleNative()}>
            <Share2 className="w-4 h-4" />
            Device
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => openExternal(whatsappShareUrl(text))}
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => openExternal(twitterShareUrl(text))}
          >
            <ExternalLink className="w-4 h-4" />
            X / Twitter
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => openExternal(facebookShareUrl(text))}
          >
            <ExternalLink className="w-4 h-4" />
            Facebook
          </Button>
        </div>

        <Button className="mt-3 w-full gap-2" onClick={() => void handleCopy()}>
          <Copy className="w-4 h-4" />
          Copy post
        </Button>
      </SheetContent>
    </Sheet>
  );
}
