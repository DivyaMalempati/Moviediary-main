import { useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { LanguagePicker, GenrePicker } from "@/components/taste-picker";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import { isDemoMode, disableDemoMode } from "@/lib/demo-auth";
import { toast } from "sonner";
import { LogOut, Upload, User } from "lucide-react";
import { Link } from "wouter";

function CinemaPreferences() {
  const { data: prefs, isLoading } = usePreferences();
  const { mutate: savePrefs, isPending } = useSavePreferences();
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [genres, setGenres] = useState<string[] | null>(null);

  // Initialise from server once loaded
  const effectiveLanguages = languages ?? prefs?.preferredLanguages ?? [];
  const effectiveGenres = genres ?? prefs?.preferredGenres ?? [];

  const toggleLanguage = (code: string) => {
    const base = languages ?? prefs?.preferredLanguages ?? [];
    setLanguages(base.includes(code) ? base.filter((c) => c !== code) : [...base, code]);
  };

  const toggleGenre = (name: string) => {
    const base = genres ?? prefs?.preferredGenres ?? [];
    setGenres(base.includes(name) ? base.filter((g) => g !== name) : [...base, name]);
  };

  const handleSave = () => {
    savePrefs(
      { preferredLanguages: effectiveLanguages, preferredGenres: effectiveGenres },
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
        Languages and genres you enjoy. Swipe, Suggestions, and Discover all prioritise these.
        Leave everything unselected to browse all world cinema.
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

      <div className="flex items-center gap-3 pt-2">
        {(effectiveLanguages.length > 0 || effectiveGenres.length > 0) && (
          <button
            onClick={() => {
              setLanguages([]);
              setGenres([]);
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

// ── Demo profile ───────────────────────────────────────────────────────────────
function DemoProfile() {
  const handleSignOut = () => {
    disableDemoMode();
    window.location.href = import.meta.env.BASE_URL || "/";
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Account */}
        <section>
          <h1 className="text-2xl font-bold mb-6">Profile & Settings</h1>
          <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-xl font-bold">
              D
            </div>
            <div>
              <p className="font-semibold">Demo User</p>
              <p className="text-sm text-muted-foreground">Local session</p>
            </div>
          </div>
        </section>

        {/* Import shortcut */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Library</h2>
          <Link href="/import">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-foreground/30 transition-colors cursor-pointer">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Import movies</p>
                <p className="text-xs text-muted-foreground">Bulk-add from a list or CSV</p>
              </div>
            </div>
          </Link>
        </section>

        {/* Language prefs */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Cinema Preferences</h2>
          <CinemaPreferences />
        </section>

        {/* Sign out */}
        <section className="pt-4 border-t border-border">
          <Button variant="ghost" className="text-destructive hover:text-destructive gap-2" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
            Exit demo
          </Button>
        </section>
      </div>
    </Layout>
  );
}

// ── Clerk profile ──────────────────────────────────────────────────────────────
function ClerkProfile() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const initial =
    user?.firstName?.[0] ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
    "?";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Account */}
        <section>
          <h1 className="text-2xl font-bold mb-6">Profile & Settings</h1>
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
        </section>

        {/* Import shortcut */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Library</h2>
          <Link href="/import">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-foreground/30 transition-colors cursor-pointer">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Import movies</p>
                <p className="text-xs text-muted-foreground">Bulk-add from a list or CSV</p>
              </div>
            </div>
          </Link>
        </section>

        {/* Language prefs */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Cinema Preferences</h2>
          <CinemaPreferences />
        </section>

        {/* Sign out */}
        <section className="pt-4 border-t border-border">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive gap-2"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </section>
      </div>
    </Layout>
  );
}

export default function ProfilePage() {
  const demo = isDemoMode();
  return demo ? <DemoProfile /> : <ClerkProfile />;
}
