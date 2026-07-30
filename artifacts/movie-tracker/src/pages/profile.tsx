import type { ReactNode } from "react";
import { useClerk, useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { PreferencesModal } from "@/components/preferences-modal";
import { isDemoMode, disableDemoMode, clearAppSession, getAuthHeaders } from "@/lib/demo-auth";
import { usePreferences } from "@/lib/preferences";
import { toast } from "sonner";
import { ChevronRight, Download, LogOut, Settings, Upload, BookOpen, Play, Users, PlusCircle } from "lucide-react";
import { Link } from "wouter";
import { useReplayFeatureTour } from "@/components/feature-walkthrough";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function exportLibrary() {
  try {
    const res = await fetch(`${BASE}/api/movies/export`, {
      credentials: "include",
      headers: await getAuthHeaders(),
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
}

function preferencesSummary(prefs: {
  preferredProviders: number[];
  maxCertification?: string | null;
} | undefined): string {
  if (!prefs) return "Loading…";
  const parts: string[] = [];
  if (prefs.maxCertification) {
    parts.push(`max ${prefs.maxCertification}`);
  }
  if (prefs.preferredProviders.length) {
    parts.push(`${prefs.preferredProviders.length} service${prefs.preferredProviders.length === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" · ") : "Cinema taste & streaming";
}

function ProfileShell({
  name,
  subtitle,
  avatar,
  onSignOut,
  signOutLabel,
}: {
  name: string;
  subtitle: string;
  avatar: ReactNode;
  onSignOut: () => void;
  signOutLabel: string;
}) {
  const { data: prefs } = usePreferences();
  const { replay, dialog } = useReplayFeatureTour();

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-10 space-y-8">
        <div className="flex items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{name}</h1>
            <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>

        <div className="space-y-1">
          <Link href="/partner">
            <button
              type="button"
              className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
            >
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 text-left">
                <span className="block">Together</span>
                <span className="block text-xs text-muted-foreground font-normal">
                  Movie-night ritual · share a link & swipe
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </Link>

          <Link href="/add">
            <button
              type="button"
              className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
            >
              <PlusCircle className="w-4 h-4 text-muted-foreground" />
              Add a film
            </button>
          </Link>

          <PreferencesModal
            trigger={
              <button
                type="button"
                className="w-full flex items-center gap-3 px-1 py-3 text-left transition-colors hover:text-foreground"
              >
                <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-foreground/90">Preferences</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {preferencesSummary(prefs)}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            }
          />

          <Link href="/guide">
            <button
              type="button"
              className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
            >
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 text-left">
                <span className="block">How Cinevault works</span>
                <span className="block text-xs text-muted-foreground font-normal">
                  Feature guide & walkthrough
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </Link>

          <button
            type="button"
            onClick={replay}
            className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
          >
            <Play className="w-4 h-4 text-muted-foreground" />
            Replay walkthrough
          </button>

          <Link href="/import">
            <button
              type="button"
              className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
            >
              <Upload className="w-4 h-4 text-muted-foreground" />
              Import
            </button>
          </Link>
          <button
            type="button"
            onClick={exportLibrary}
            className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
            Export library
          </button>
        </div>

        <div className="pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive px-1 gap-2"
            onClick={onSignOut}
          >
            <LogOut className="w-4 h-4" />
            {signOutLabel}
          </Button>
        </div>
      </div>
      {dialog}
    </Layout>
  );
}

function DemoProfile() {
  return (
    <ProfileShell
      name="Demo User"
      subtitle="Local session"
      signOutLabel="Exit demo & sign in"
      onSignOut={() => {
        disableDemoMode();
        window.location.href =
          (import.meta.env.BASE_URL || "/").replace(/\/$/, "") + "/sign-in";
      }}
      avatar={
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold shrink-0">
          D
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
      name={user?.fullName || user?.emailAddresses?.[0]?.emailAddress || "Account"}
      subtitle={user?.fullName ? (user?.emailAddresses?.[0]?.emailAddress ?? "") : "Signed in"}
      signOutLabel="Sign out"
      onSignOut={() => {
        clearAppSession();
        void signOut({ redirectUrl: basePath || "/" });
      }}
      avatar={
        user?.imageUrl ? (
          <img src={user.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold shrink-0">
            {initial}
          </div>
        )
      }
    />
  );
}

export default function ProfilePage() {
  return isDemoMode() ? <DemoProfile /> : <ClerkProfile />;
}
