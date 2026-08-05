import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Show } from "@clerk/react";
import { Clapperboard, Film, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPosterUrl } from "@/lib/movie-utils";
import {
  useSharedCollection,
  useCopySharedCollection,
  type SharedCollectionItem,
} from "@/lib/collections-api";
import { isDemoMode, exitDemoToSignIn, clearAppSession, disableDemoMode } from "@/lib/demo-auth";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkConfigured = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.CLERK_PUBLISHABLE_KEY,
);

function goSignIn(returnPath: string) {
  try {
    sessionStorage.setItem("cinevault:return-to", returnPath);
  } catch {
    /* ignore */
  }
  if (isDemoMode()) {
    exitDemoToSignIn();
    return;
  }
  disableDemoMode();
  clearAppSession();
  window.location.assign(`${window.location.origin}${BASE}/sign-in`);
}

function SharedPoster({
  item,
  selected,
  onToggle,
}: {
  item: SharedCollectionItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const url = getPosterUrl(item.posterPath, "w500");
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative text-left rounded-lg overflow-hidden border transition-colors ${
        selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-white/30"
      }`}
    >
      <div className="aspect-[2/3] bg-secondary flex items-center justify-center">
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Film className="w-8 h-8 text-muted-foreground opacity-40" />
        )}
      </div>
      <div className="p-2 space-y-0.5">
        <p className="text-xs font-medium line-clamp-2 leading-snug">{item.title}</p>
        {item.releaseYear != null && (
          <p className="text-[10px] text-muted-foreground">{item.releaseYear}</p>
        )}
      </div>
      <div
        className={`absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center ${
          selected ? "bg-primary border-primary text-primary-foreground" : "bg-black/50 border-white/30"
        }`}
      >
        {selected ? <Check className="w-3.5 h-3.5" /> : null}
      </div>
    </button>
  );
}

function CopyToolbar({
  token,
  items,
  selected,
}: {
  token: string;
  items: SharedCollectionItem[];
  selected: Set<number>;
}) {
  const copy = useCopySharedCollection(token);
  const selectedCount = selected.size;

  const runCopy = async (all: boolean) => {
    try {
      const result = await copy.mutateAsync(
        all ? { all: true } : { tmdbIds: Array.from(selected) },
      );
      const parts = [
        result.added > 0 ? `${result.added} added` : null,
        result.skipped > 0 ? `${result.skipped} already in library` : null,
        result.missing > 0 ? `${result.missing} unavailable` : null,
      ].filter(Boolean);
      toast.success(parts.join(" · ") || "Nothing to add");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("401") || /unauthorized/i.test(msg)) {
        goSignIn(`/c/${token}`);
        return;
      }
      toast.error(msg || "Couldn’t add to watchlist");
    }
  };

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      <Button
        size="sm"
        variant="outline"
        disabled={selectedCount === 0 || copy.isPending}
        onClick={() => void runCopy(false)}
      >
        {copy.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Add selected ({selectedCount})
      </Button>
      <Button
        size="sm"
        disabled={items.length === 0 || copy.isPending}
        onClick={() => void runCopy(true)}
      >
        Add all to watchlist
      </Button>
    </div>
  );
}

function SignInToCopy({ token }: { token: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2 text-center max-w-sm mx-auto">
      <p className="text-sm text-muted-foreground">
        Sign in to add films from this collection to your watchlist.
      </p>
      <Button size="sm" onClick={() => goSignIn(`/c/${token}`)}>
        Sign in
      </Button>
    </div>
  );
}

function CopySection({
  token,
  items,
  selected,
}: {
  token: string;
  items: SharedCollectionItem[];
  selected: Set<number>;
}) {
  if (isDemoMode()) {
    return <SignInToCopy token={token} />;
  }

  if (clerkConfigured) {
    return (
      <>
        <Show when="signed-in">
          <CopyToolbar token={token} items={items} selected={selected} />
        </Show>
        <Show when="signed-out">
          <SignInToCopy token={token} />
        </Show>
      </>
    );
  }

  return <SignInToCopy token={token} />;
}

export default function SharedCollectionPage() {
  const params = useParams<{ token?: string }>();
  const token = (params.token ?? "").trim();
  const { data, isLoading, isError, error } = useSharedCollection(token, !!token);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const items = data?.items ?? [];

  const allSelected = useMemo(
    () => items.length > 0 && items.every((i) => selected.has(i.tmdbId)),
    [items, selected],
  );

  const toggle = (tmdbId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.tmdbId)));
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <Link href="/" className="flex items-center gap-2 hover:opacity-90">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold text-lg tracking-tight">Cinevault</span>
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/watchlist">My watchlist</Link>
        </Button>
      </header>

      <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full space-y-6">
        {!token ? (
          <p className="text-center text-muted-foreground">Invalid share link.</p>
        ) : isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 space-y-2">
            <p className="font-semibold">Collection not available</p>
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message === "Collection not found"
                ? "This link may be private or no longer valid."
                : ((error as Error)?.message ?? "Couldn’t load this collection.")}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Shared collection
              </p>
              <h1 className="text-3xl font-bold">{data?.name}</h1>
              <p className="text-sm text-muted-foreground">
                {data?.itemCount ?? 0} film{(data?.itemCount ?? 0) !== 1 ? "s" : ""} · titles and
                posters only
              </p>
            </div>

            <CopySection token={token} items={items} selected={selected} />

            {items.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                No shareable films in this collection yet.
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={toggleAll}>
                    {allSelected ? "Clear selection" : "Select all"}
                  </Button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                  {items.map((item) => (
                    <SharedPoster
                      key={item.tmdbId}
                      item={item}
                      selected={selected.has(item.tmdbId)}
                      onToggle={() => toggle(item.tmdbId)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
