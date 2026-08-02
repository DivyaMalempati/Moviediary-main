import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { authFetch, ensureClerkApiSession } from "@/lib/demo-auth";
import { toast } from "sonner";
import { Loader2, MessageSquareHeart } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORIES: { id: string; label: string }[] = [
  { id: "logging", label: "Logging & diary" },
  { id: "discover", label: "Discover & swipe" },
  { id: "together", label: "Together / movie night" },
  { id: "reminders", label: "Reminders & releases" },
  { id: "import_export", label: "Import / export" },
  { id: "other", label: "Something else" },
];

export type FeedbackSource = "prompt" | "profile";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: FeedbackSource;
  /** Called after a successful submit (or when user dismisses without sending, if you want). */
  onSubmitted?: () => void;
};

export function FeatureFeedbackDialog({ open, onOpenChange, source, onSubmitted }: Props) {
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMessage("");
    setCategory(null);
    setBusy(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    const text = message.trim();
    if (text.length < 3) {
      toast.error("Tell us a bit more about what you’d like");
      return;
    }
    setBusy(true);
    try {
      await ensureClerkApiSession();
      const res = await authFetch(`${BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          source,
          ...(category ? { category } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Couldn’t send feedback");
        return;
      }
      toast.success("Thanks — we read every request");
      reset();
      onOpenChange(false);
      onSubmitted?.();
    } catch {
      toast.error("Couldn’t send feedback");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareHeart className="w-5 h-5 text-primary" />
            What should a movie diary do?
          </DialogTitle>
          <DialogDescription>
            Tell us a feature you expect — logging habits, reminders, lists, Together nights,
            anything. We use this to shape Cinevault.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(active ? null : c.id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Track rewatch counts per friend, or alert me when a Telugu film hits OTT…"
            className="min-h-[120px] resize-none"
            maxLength={2000}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground text-right">{message.trim().length}/2000</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            Not now
          </Button>
          <Button onClick={() => void submit()} disabled={busy || message.trim().length < 3}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
