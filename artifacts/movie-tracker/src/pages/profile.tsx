import { useState, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguagePicker, GenrePicker, ProviderPicker } from "@/components/taste-picker";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import { isDemoMode, disableDemoMode, getGuestHeaders } from "@/lib/demo-auth";
import { toast } from "sonner";
import { Download, LogOut, Upload } from "lucide-react";
import { Link, useSearch } from "wouter";
import { useListMovies, getListMoviesQueryKey } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function exportClientCSV(movies: any[], filename: string, statusLabel: string) {
  const cols = ["title", "status", "rating", "year", "language", "genres", "notes", "added", "watched", "rewatches"];
  const rows = movies.map((m) => [
    m.title,
    statusLabel,
    m.rating ?? "",
    m.releaseYear ?? "",
    m.originalLanguage ?? "",
    (m.genres as string[] | null)?.join("; ") ?? "",
    m.notes ?? "",
    m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "",
    m.watchedAt ? new Date(m.watchedAt).toLocaleDateString() : "",
    m.rewatchCount ?? 0,
  ]);
  const csv = [cols, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CinemaPreferences() {
  const { data: prefs, isLoading } = usePreferences();
  const { mutate: savePrefs, isPending } = useSavePreferences();
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [genres, setGenres] = useState<string[] | null>(null);
  const [providers, setProviders] = useState<number[] | null>(null);

  const effectiveLanguages = languages ?? prefs?.preferredLanguages ?? [];
  const effectiveGenres = genres ?? prefs?.preferredGenres ?? [];
  const effectiveProviders = providers ?? prefs?.preferredProviders ?? [];

  const toggleLanguage = (code: string) => {
    const base = languages ?? prefs?.preferredLanguages ?? [];
    setLanguages(base.includes(code) ? base.filter((c) => c !== code) : [...base, code]);
  };

  const toggleGenre = (name: string) => {
    const base = genres ?? prefs?.preferredGenres ?? [];
    setGenres(base.includes(name) ? base.filter((g) => g !== name) : [...base, name]);
  };

  const toggleProvider = (id: number) => {
    const base = providers ?? prefs?.preferredProviders ?? [];
    setProviders(base.includes(id) ? base.filter((p) => p !== id) : [...base, id]);
  };

  const handleSave = () => {
    savePrefs(
      {
        preferredLanguages: effectiveLanguages,
        preferredGenres: effectiveGenres,
        preferredProviders: effectiveProviders,
        watchRegion: prefs?.watchRegion ?? "IN",
      },
      {
        onSuccess: () => toast.success("Preferences saved"),
        onError: () => toast.error("Failed to save preferences"),
      }
    );
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Languages, genres, and streaming services. Swipe and Search can prioritise films you can stream tonight.
      </p>

      <section className="space-y-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Languages
        </h3>
        <LanguagePicker selected={effectiveLanguages} onToggle={toggleLanguage} />
      </section>

      <section className="space-y-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Genres
        </h3>
        <GenrePicker selected={effectiveGenres} onToggle={toggleGenre} />
      </section>

      <section className="space-y-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Streaming services
        </h3>
        <ProviderPicker
          selected={effectiveProviders}
          onToggle={toggleProvider}
          watchRegion={prefs?.watchRegion ?? "IN"}
        />
      </section>

      <div className="flex items-center gap-3 pt-2">
        {(effectiveLanguages.length > 0 || effectiveGenres.length > 0 || effectiveProviders.length > 0) && (
          <button
            onClick={() => {
              setLanguages([]);
              setGenres([]);
              setProviders([]);
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending}
          className="ml-auto bg-white text-black hover:bg-white/90"
        >
          {isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </div>
  );
}

function ImportExportPanel() {
  const { data: watched } = useListMovies(
    { status: "watched" },
    { query: { queryKey: getListMoviesQueryKey({ status: "watched" }) } },
  );
  const { data: watchlist } = useListMovies(
    { status: "watchlist" },
    { query: { queryKey: getListMoviesQueryKey({ status: "watchlist" }) } },
  );

  const downloadFullLibrary = async () => {
    try {
      const res = await fetch(`${BASE}/api/movies/export`, {
        credentials: "include",
        headers: { ...getGuestHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cinevault_library.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Library exported");
    } catch {
      toast.error("Failed to export library");
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Bring films in from a list or CSV, or download your library for backup.
      </p>

      <section className="space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Import
        </h3>
        <Link href="/import">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-foreground/30 transition-colors cursor-pointer">
            <Upload className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Import movies</p>
              <p className="text-xs text-muted-foreground">Bulk-add from a title list or CSV</p>
            </div>
          </div>
        </Link>
      </section>

      <section className="space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Export
        </h3>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Watched</p>
              <p className="text-xs text-muted-foreground">
                {watched?.length ?? 0} film{(watched?.length ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              disabled={!watched?.length}
              onClick={() => exportClientCSV(watched ?? [], "cinevault_watched.csv", "watched")}
            >
              <Download className="w-3 h-3" /> CSV
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Watchlist</p>
              <p className="text-xs text-muted-foreground">
                {watchlist?.length ?? 0} film{(watchlist?.length ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              disabled={!watchlist?.length}
              onClick={() => exportClientCSV(watchlist ?? [], "cinevault_watchlist.csv", "watchlist")}
            >
              <Download className="w-3 h-3" /> CSV
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Full library</p>
              <p className="text-xs text-muted-foreground">Watched + watchlist in one file</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={downloadFullLibrary}
            >
              <Download className="w-3 h-3" /> CSV
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function profileTabFromSearch(search: string): "preferences" | "library" {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("tab") === "library" ? "library" : "preferences";
}

function ProfileShell({
  account,
  onSignOut,
  signOutLabel,
}: {
  account: ReactNode;
  onSignOut: () => void;
  signOutLabel: string;
}) {
  const search = useSearch();
  const [tab, setTab] = useState<"preferences" | "library">(() => profileTabFromSearch(search));

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h1 className="text-2xl font-bold mb-6">Profile & Settings</h1>
          {account}
        </section>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "preferences" | "library")}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="library">Import / Export</TabsTrigger>
          </TabsList>
          <TabsContent value="preferences" className="space-y-4">
            <CinemaPreferences />
          </TabsContent>
          <TabsContent value="library">
            <ImportExportPanel />
          </TabsContent>
        </Tabs>

        <section className="pt-4 border-t border-border">
          <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={onSignOut}>
            <LogOut className="w-4 h-4" />
            {signOutLabel}
          </Button>
        </section>
      </div>
    </Layout>
  );
}

function DemoProfile() {
  return (
    <ProfileShell
      signOutLabel="Exit demo"
      onSignOut={() => {
        disableDemoMode();
        window.location.href = import.meta.env.BASE_URL || "/";
      }}
      account={
        <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-xl font-bold">
            D
          </div>
          <div>
            <p className="font-semibold">Demo User</p>
            <p className="text-sm text-muted-foreground">Local session</p>
          </div>
        </div>
      }
    />
  );
}

function ClerkProfile() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const initial =
    user?.firstName?.[0] ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
    "?";

  return (
    <ProfileShell
      signOutLabel="Sign out"
      onSignOut={() => signOut({ redirectUrl: basePath || "/" })}
      account={
        <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-xl font-bold">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            {user?.fullName && (
              <p className="font-semibold truncate">{user.fullName}</p>
            )}
            <p className="text-sm text-muted-foreground truncate">
              {user?.emailAddresses?.[0]?.emailAddress ?? ""}
            </p>
          </div>
        </div>
      }
    />
  );
}

export default function ProfilePage() {
  const demo = isDemoMode();
  return demo ? <DemoProfile /> : <ClerkProfile />;
}
