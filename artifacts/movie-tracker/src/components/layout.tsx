import { ReactNode, Component, ErrorInfo } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Clapperboard, Eye, Bookmark, PlusCircle, Sparkles, FolderOpen, BarChart2, Upload, User, Shuffle, Users, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo-auth";
import { FeatureWalkthroughHost } from "@/components/feature-walkthrough";

interface LayoutProps {
  children: ReactNode;
}

// ── Error boundary so Clerk hooks never crash the whole page ─────────────────
class ClerkBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn("[ClerkBoundary] caught:", err.message, info);
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

// ── Sidebar user section (links to /profile) ──────────────────────────────────
function ClerkUserSection() {
  const { user } = useUser();
  const initial =
    user?.firstName?.[0] ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
    "?";

  return (
    <Link href="/profile" className="flex items-center gap-3 group hover:opacity-80 transition-opacity cursor-pointer">
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
    <Link href="/profile" className="flex items-center gap-3 group hover:opacity-80 transition-opacity cursor-pointer">
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

  // Sidebar shows all items including Import
  const sidebarItems = [
    { href: "/watched",     label: "Watched",     icon: Eye },
    { href: "/watchlist",   label: "Watchlist",   icon: Bookmark },
    { href: "/collections", label: "Collections", icon: FolderOpen },
    { href: "/stats",       label: "Stats",       icon: BarChart2 },
    { href: "/add",         label: "Add",         icon: PlusCircle },
    { href: "/suggestions", label: "Discover",    icon: Sparkles },
    { href: "/swipe",       label: "Swipe",       icon: Shuffle },
    { href: "/partner",     label: "Together",    icon: Users },
    { href: "/guide",       label: "Guide",       icon: BookOpen },
    { href: "/import",      label: "Import",      icon: Upload },
  ];

  // Bottom nav (mobile) — most-used items + profile; Swipe replaces Collections
  const bottomItems = [
    { href: "/watched",   label: "Watched",  icon: Eye },
    { href: "/watchlist", label: "Watchlist", icon: Bookmark },
    { href: "/swipe",     label: "Swipe",     icon: Shuffle },
    { href: "/add",       label: "Add",       icon: PlusCircle },
    { href: "/profile",   label: "Profile",   icon: User },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground">
      {/* Sidebar — Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card/30 backdrop-blur-md sticky top-0 h-screen">
        <div className="p-6 pb-2">
          <Link href="/watched" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Clapperboard className="w-5 h-5" />
            </div>
            <span className="font-sans font-bold text-xl tracking-tight">Cinevault</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {sidebarItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
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

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>

      {/* Bottom Nav — Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {bottomItems.map(({ href, label, icon: Icon }) => {
          const isActive = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 p-2 min-w-[4rem] rounded-xl transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
      <FeatureWalkthroughHost />
    </div>
  );
}
