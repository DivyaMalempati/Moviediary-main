import { useLocation } from "wouter";
import WatchedPage from "./watched";
import WatchlistPage from "./watchlist";
import UpcomingPage from "./upcoming";
import { cn } from "@/lib/utils";

type Tab = "watched" | "watchlist" | "upcoming";

export default function LibraryPage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "");
  const raw = params.get("tab");
  const tab: Tab = raw === "watchlist" ? "watchlist" : raw === "upcoming" ? "upcoming" : "watched";

  const setTab = (t: Tab) => {
    setLocation(`/library?tab=${t}`, { replace: true });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "watched", label: "Watched" },
    { id: "watchlist", label: "Watchlist" },
    { id: "upcoming", label: "Upcoming" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {/* Pill toggle — centered */}
      <div className="px-4 md:px-8 pt-6 pb-0 max-w-7xl mx-auto w-full flex justify-center">
        <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-full">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "px-5 py-1.5 rounded-full text-sm font-medium transition-all",
                tab === id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "watched" && <WatchedPage />}
      {tab === "watchlist" && <WatchlistPage />}
      {tab === "upcoming" && <UpcomingPage />}
    </div>
  );
}
