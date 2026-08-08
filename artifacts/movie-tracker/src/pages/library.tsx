import { useLocation } from "wouter";
import WatchedPage from "./watched";
import WatchlistPage from "./watchlist";
import { cn } from "@/lib/utils";

export default function LibraryPage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "");
  const tab = params.get("tab") === "watchlist" ? "watchlist" : "watched";

  const setTab = (t: "watched" | "watchlist") => {
    setLocation(`/library?tab=${t}`, { replace: true });
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Pill toggle */}
      <div className="px-4 md:px-8 pt-6 pb-0 max-w-7xl mx-auto w-full">
        <div className="inline-flex items-center gap-1 bg-secondary/60 p-1 rounded-full">
          <button
            onClick={() => setTab("watched")}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-medium transition-all",
              tab === "watched"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Watched
          </button>
          <button
            onClick={() => setTab("watchlist")}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-medium transition-all",
              tab === "watchlist"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Watchlist
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === "watched" ? <WatchedPage /> : <WatchlistPage />}
    </div>
  );
}
