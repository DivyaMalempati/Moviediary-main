import type { ReactNode } from "react";
import { useClerk, useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { isDemoMode, disableDemoMode, getGuestHeaders } from "@/lib/demo-auth";
import { toast } from "sonner";
import { Download, LogOut, Upload } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function exportLibrary() {
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
    </Layout>
  );
}

function DemoProfile() {
  return (
    <ProfileShell
      name="Demo User"
      subtitle="Local session"
      signOutLabel="Exit demo"
      onSignOut={() => {
        disableDemoMode();
        window.location.href = import.meta.env.BASE_URL || "/";
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
      onSignOut={() => signOut({ redirectUrl: basePath || "/" })}
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
