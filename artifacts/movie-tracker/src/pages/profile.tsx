import type { ReactNode } from "react";
import { useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PreferencesModal } from "@/components/preferences-modal";
import { ClerkBoundary } from "@/components/clerk-boundary";
import { FeatureFeedbackDialog } from "@/components/feature-feedback-dialog";
import { markFeedbackSubmitted } from "@/components/feature-feedback-prompt";
import { isDemoMode, exitDemoToSignIn, clearAppSession, authFetch } from "@/lib/demo-auth";
import { usePreferences } from "@/lib/preferences";
import {
  useCollections,
  type SmartRule,
  type CollectionSummary,
} from "@/lib/collections-api";
import { getPosterUrl } from "@/lib/movie-utils";
import { toast } from "sonner";
import {
  ChevronRight,
  Download,
  LogOut,
  Settings,
  Upload,
  Play,
  Users,
  Loader2,
  MessageSquareHeart,
  FolderOpen,
  Plus,
  Film,
  Zap,
  Globe,
  Lock,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useReplayFeatureTour } from "@/components/feature-walkthrough";
import { isFeatureEnabled } from "@/lib/features";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function exportLibrary() {
  try {
    // authFetch remints stale app sessions on 401 (plain fetch does not).
    const res = await authFetch(`${BASE}/api/movies/export`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cinevault_library.csv";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
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

// ── Poster mosaic (up to 4 posters, mirrored from collections.tsx) ────────────
function PosterMosaic({ posters, size = 56 }: { posters: (string | null)[]; size?: number }) {
  const filled = [...posters, null, null, null, null].slice(0, 4);
  return (
    <div
      className="grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      {filled.map((p, i) => {
        const url = p ? getPosterUrl(p, "w500") : null;
        return (
          <div key={i} className="bg-secondary flex items-center justify-center">
            {url ? (
              <img src={url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Film className="w-3 h-3 text-muted-foreground opacity-40" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Collection card (read-only — edit/delete stays on /collections) ───────────
function CollectionCard({ col }: { col: CollectionSummary }) {
  const [, setLocation] = useLocation();
  const isSmart = Array.isArray(col.rules) && col.rules.length > 0;
  return (
    <div
      className="bg-card border border-border rounded-xl p-3 flex gap-3 items-center hover:border-white/20 transition-colors cursor-pointer"
      onClick={() => setLocation(`/collections/${col.id}`)}
    >
      <PosterMosaic posters={col.posters} size={56} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-medium text-sm truncate">{col.name}</p>
          {isSmart && (
            <Badge
              variant="secondary"
              className="gap-1 text-[10px] px-1.5 py-0 h-4 shrink-0 bg-primary/15 text-primary border-primary/20"
            >
              <Zap className="w-2.5 h-2.5" /> Smart
            </Badge>
          )}
          {(col.visibility ?? "private") === "public" ? (
            <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 h-4 shrink-0">
              <Globe className="w-2.5 h-2.5" /> Public
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="gap-1 text-[10px] px-1.5 py-0 h-4 shrink-0 text-muted-foreground"
            >
              <Lock className="w-2.5 h-2.5" /> Private
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {col.movieCount} film{col.movieCount !== 1 ? "s" : ""}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// ── Collections tab content ────────────────────────────────────────────────────
function ProfileCollectionsTab() {
  const { data: collections, isLoading } = useCollections();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Your named shelves</p>
        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" asChild>
          <Link href="/collections">
            <Plus className="w-3.5 h-3.5" /> New collection
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !collections?.length ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground mb-3">No collections yet.</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/collections">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Create your first
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map((col) => (
            <CollectionCard key={col.id} col={col} />
          ))}
          <div className="pt-1">
            <Link href="/collections" className="text-xs text-primary hover:underline">
              Manage collections →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
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
  const { replay } = useReplayFeatureTour();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{name}</h1>
            <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="w-full" data-tour="profile-tabs">
            <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
            <TabsTrigger value="collections" className="flex-1" data-tour="profile-collections-tab">
              Collections
            </TabsTrigger>
          </TabsList>

          {/* ── Profile tab ─────────────────────────────────────────────── */}
          <TabsContent value="profile" className="mt-4">
            <div className="space-y-1">
              <Link href="/partner">
                <button
                  type="button"
                  data-tour="profile-together"
                  className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
                >
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 text-left">
                    <span className="block">Together</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Invite by name · movie nights &amp; swipe sessions
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
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

              <button
                type="button"
                onClick={replay}
                className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
              >
                <Play className="w-4 h-4 text-muted-foreground" />
                Replay walkthrough
              </button>

              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
              >
                <MessageSquareHeart className="w-4 h-4 text-muted-foreground" />
                <span className="flex-1 text-left">
                  <span className="block">Request a feature</span>
                  <span className="block text-xs text-muted-foreground font-normal">
                    Tell us what you expect from a movie diary
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>

              {isFeatureEnabled("import") && (
                <Link href="/import">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    Import
                  </button>
                </Link>
              )}

              <button
                type="button"
                onClick={exportLibrary}
                className="w-full flex items-center gap-3 px-1 py-3 text-left text-sm hover:text-foreground text-foreground/90 transition-colors"
              >
                <Download className="w-4 h-4 text-muted-foreground" />
                Export library
              </button>
            </div>

            <div className="pt-4 border-t border-border mt-4">
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
          </TabsContent>

          {/* ── Collections tab ─────────────────────────────────────────── */}
          <TabsContent value="collections" className="mt-4">
            <ProfileCollectionsTab />
          </TabsContent>
        </Tabs>
      </div>

      <FeatureFeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        source="profile"
        onSubmitted={() => markFeedbackSubmitted()}
      />
    </>
  );
}

function DemoProfile() {
  return (
    <ProfileShell
      name="Demo User"
      subtitle="Local session"
      signOutLabel="Exit demo & sign in"
      onSignOut={() => {
        exitDemoToSignIn();
      }}
      avatar={
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold shrink-0">
          D
        </div>
      }
    />
  );
}

function ProfileLoading() {
  return (
    <>
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading account…
      </div>
    </>
  );
}

function ProfileClerkFallback() {
  return (
    <>
      <div className="max-w-md mx-auto px-4 py-10 space-y-4">
        <h1 className="text-lg font-semibold">Account unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load your signed-in profile. Try signing in again.
        </p>
        <Link href="/sign-in">
          <Button>Sign in</Button>
        </Link>
      </div>
    </>
  );
}

function ClerkProfile() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (!isLoaded) {
    return <ProfileLoading />;
  }

  if (!isSignedIn) {
    // ProtectedRoute normally redirects; keep a safe fallback if Clerk session flickers.
    return <ProfileClerkFallback />;
  }

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
        void signOut({ redirectUrl: `${window.location.origin}${basePath || ""}/` });
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
  if (isDemoMode()) {
    return <DemoProfile />;
  }

  return (
    <ClerkBoundary fallback={<ProfileClerkFallback />}>
      <ClerkProfile />
    </ClerkBoundary>
  );
}
