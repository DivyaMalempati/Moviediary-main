import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  Clapperboard,
  Eye,
  Bookmark,
  PlusCircle,
  Sparkles,
  FolderOpen,
  BarChart2,
  Upload,
  User,
  Shuffle,
  Users,
  BookOpen,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isDemoMode, exitDemoToSignIn } from "@/lib/demo-auth";
import { ClerkBoundary } from "@/components/clerk-boundary";
import { BOTTOM_NAV, SIDEBAR_NAV, enabledNav } from "@/lib/features";
import { tourTargetForHref } from "@/lib/feature-guide";
import { isDiscoverTab } from "@/components/discover-content";

function navItemActive(location: string, href: string): boolean {
  const [hrefPath, hrefSearch] = href.split("?");
  const locPath = location.split("?")[0] || "/";
  const tab =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tab")
      : null;

  // Sidebar Discover deep-links into Add discover tabs.
  if (hrefPath === "/add" && hrefSearch?.includes("tab=")) {
    return locPath === "/add" && isDiscoverTab(tab);
  }
  // Plain Add = Log mode only (not Discover sub-tabs).
  if (hrefPath === "/add" && !hrefSearch) {
    return locPath === "/add" && !isDiscoverTab(tab);
  }
  return locPath === hrefPath || (hrefPath !== "/" && locPath.startsWith(`${hrefPath}/`));
}

interface LayoutProps {
  children: ReactNode;
}

function iconForHref(href: string): LucideIcon {
  switch (href) {
    case "/watched":
      return Eye;
    case "/watchlist":
      return Bookmark;
    case "/partner":
      return Users;
    case "/swipe":
      return Shuffle;
    case "/add":
      return PlusCircle;
    case "/add?tab=search":
    case "/add?tab=people":
      return Sparkles;
    case "/guide":
      return BookOpen;
    case "/suggestions":
      return Sparkles;
    case "/upcoming":
      return CalendarClock;
    case "/collections":
      return FolderOpen;
    case "/stats":
      return BarChart2;
    case "/import":
      return Upload;
    case "/profile":
      return User;
    default:
      return Clapperboard;
  }
}

function ClerkUserSection() {
  const { user } = useUser();
  const initial =
    user?.firstName?.[0] ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
    "?";

  return (
    <Link
      href="/profile"
      data-tour="nav-profile"
      className="flex items-center gap-3 group hover:opacity-80 transition-opacity cursor-pointer"
    >
      {user?.imageUrl ? (
        <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {user?.firstName && (
          <p className="text-xs font-medium truncate leading-tight">{user.firstName}</p>
        )}
        <p className="text-[11px] text-muted-foreground truncate leading-tight">
          {user?.emailAddresses?.[0]?.emailAddress ?? ""}
        </p>
      </div>
      <User className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </Link>
  );
}

function DemoUserSection() {
  return (
    <Link
      href="/profile"
      data-tour="nav-profile"
      className="flex items-center gap-3 group hover:opacity-80 transition-opacity cursor-pointer"
    >
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
        D
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">Demo User</p>
        <p className="text-[10px] text-muted-foreground">Local session</p>
      </div>
      <User className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </Link>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const demo = isDemoMode();
  const sidebarItems = enabledNav(SIDEBAR_NAV);
  const bottomItems = enabledNav(BOTTOM_NAV);

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground">
      {demo && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-amber-400 text-black text-xs sm:text-sm font-medium py-1.5 px-3 flex items-center justify-center gap-3">
          <span>Demo mode — your data stays on this device</span>
          <button
            type="button"
            onClick={() => exitDemoToSignIn()}
            className="underline font-semibold hover:no-underline"
          >
            Exit &amp; sign in with Google
          </button>
        </div>
      )}

      <aside className={`hidden md:flex w-64 flex-col border-r border-border bg-card/30 backdrop-blur-md sticky top-0 h-screen ${demo ? "pt-8" : ""}`}>
        <div className="p-6 pb-2">
          <Link href="/watched" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Clapperboard className="w-5 h-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-sans font-bold text-xl tracking-tight">Cinevault</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto min-h-0">
          {sidebarItems.map(({ href, label }) => {
            const Icon = iconForHref(href);
            const isActive = navItemActive(location, href);
            const tourId = tourTargetForHref(href);
            return (
              <Link
                key={href}
                href={href}
                data-tour={tourId}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <ClerkBoundary fallback={<DemoUserSection />}>
            {demo ? <DemoUserSection /> : <ClerkUserSection />}
          </ClerkBoundary>
        </div>
      </aside>

      <main className={`flex-1 flex flex-col min-w-0 pb-20 md:pb-0 ${demo ? "pt-8" : ""}`}>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {bottomItems.map(({ href, label }) => {
          const Icon = iconForHref(href);
          const isActive = navItemActive(location, href);
          const tourId = tourTargetForHref(href);
          return (
            <Link
              key={href}
              href={href}
              data-tour={tourId}
              className={cn(
                "flex flex-col items-center gap-1 p-2 min-w-[4rem] rounded-xl transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
