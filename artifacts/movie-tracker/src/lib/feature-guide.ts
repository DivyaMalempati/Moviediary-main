import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  Eye,
  FolderOpen,
  BarChart2,
  PlusCircle,
  Sparkles,
  Shuffle,
  Users,
  Upload,
  RotateCcw,
  Clapperboard,
  Tv,
} from "lucide-react";

/** Bump when the tour content changes so returning users see the new version once. */
export const FEATURE_TOUR_VERSION = 1;
export const FEATURE_TOUR_STORAGE_KEY = `cinevault:feature-tour:v${FEATURE_TOUR_VERSION}`;

export type FeatureGuideItem = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  href: string;
  cta: string;
  icon: LucideIcon;
};

/** Short first-visit walkthrough steps (keep lean). */
export const FEATURE_TOUR_STEPS: FeatureGuideItem[] = [
  {
    id: "vault",
    title: "Your vault",
    summary: "Watched and Watchlist hold everything you’ve logged.",
    detail:
      "Mark films watched with a rating, save titles for later, and open any poster for notes, streaming, and similar picks.",
    href: "/watched",
    cta: "Open Watched",
    icon: Eye,
  },
  {
    id: "swipe",
    title: "Swipe decks",
    summary: "A short personalized deck — not an endless scroll.",
    detail:
      "Left skips, right saves to Watchlist, up logs as Watched. Filter by genre, trope (heist, twist ending…), or what’s on your streaming apps.",
    href: "/swipe",
    cta: "Start swiping",
    icon: Shuffle,
  },
  {
    id: "discover",
    title: "Discover & partner",
    summary: "Recommendations for you — or a shared deck with someone else.",
    detail:
      "Discover mixes AI For You, Because You Liked, and Trending. Partner links profiles so you can swipe the same deck and celebrate mutual likes.",
    href: "/suggestions",
    cta: "Open Discover",
    icon: Sparkles,
  },
  {
    id: "more",
    title: "Collections, stats & import",
    summary: "Organize deeper, see your patterns, bring an old list in.",
    detail:
      "Build collections, check stats, import a CSV, and log rewatches with optional dates. Reopen this guide anytime from Profile.",
    href: "/collections",
    cta: "Browse collections",
    icon: FolderOpen,
  },
];

/** Full reference guide shown on /guide. */
export const FEATURE_GUIDE_SECTIONS: Array<{
  heading: string;
  items: FeatureGuideItem[];
}> = [
  {
    heading: "Library",
    items: [
      {
        id: "watched",
        title: "Watched",
        summary: "Your diary of films you’ve seen.",
        detail:
          "Search, filter, and sort. Log a rewatch (date optional) and get anniversary reminders when a film hits the same day years later.",
        href: "/watched",
        cta: "Go to Watched",
        icon: Eye,
      },
      {
        id: "watchlist",
        title: "Watchlist",
        summary: "Films you’re saving for later.",
        detail:
          "Rate from the poster overlay to move a title into Watched. Export your list anytime.",
        href: "/watchlist",
        cta: "Go to Watchlist",
        icon: Bookmark,
      },
      {
        id: "add",
        title: "Add",
        summary: "Search TMDB and add to your vault.",
        detail:
          "Filter results to titles available on your streaming services when you’ve set them in Preferences.",
        href: "/add",
        cta: "Add a film",
        icon: PlusCircle,
      },
      {
        id: "import",
        title: "Import",
        summary: "Bring an existing list into Cinevault.",
        detail:
          "Paste or upload titles — we match them to TMDB and add watched or watchlist rows.",
        href: "/import",
        cta: "Import list",
        icon: Upload,
      },
    ],
  },
  {
    heading: "Find something to watch",
    items: [
      {
        id: "swipe-guide",
        title: "Swipe",
        summary: "12-card decks mixed for your taste.",
        detail:
          "About 60% safe matches from your taste, 20% high-rated titles on your OTT apps, and 20% hidden gems. Genre and trope chips refine the deck.",
        href: "/swipe",
        cta: "Open Swipe",
        icon: Shuffle,
      },
      {
        id: "discover-guide",
        title: "Discover",
        summary: "For You, Because You Liked, and Trending India.",
        detail:
          "Mark picks watched or save them. Films already in your library stay out of the feed.",
        href: "/suggestions",
        cta: "Open Discover",
        icon: Sparkles,
      },
      {
        id: "partner-guide",
        title: "Partner match",
        summary: "Solve “what should we watch tonight?”",
        detail:
          "Generate a pair code, link profiles, swipe one shared deck, celebrate mutual likes, and log the match to both diaries.",
        href: "/partner",
        cta: "Link a partner",
        icon: Users,
      },
      {
        id: "streaming",
        title: "Streaming prefs",
        summary: "Tell us which apps you actually use.",
        detail:
          "Set Netflix, Prime, Hotstar, and more under Profile → Preferences so Swipe and Add can bias toward what’s streamable tonight.",
        href: "/profile",
        cta: "Open Preferences",
        icon: Tv,
      },
    ],
  },
  {
    heading: "Organize & revisit",
    items: [
      {
        id: "collections-guide",
        title: "Collections",
        summary: "Manual lists or smart rules.",
        detail:
          "Group films by mood, decade, or custom rules so your vault stays browsable.",
        href: "/collections",
        cta: "Open Collections",
        icon: FolderOpen,
      },
      {
        id: "stats-guide",
        title: "Stats",
        summary: "See how you watch.",
        detail:
          "Totals, ratings mix, languages, genres, and monthly activity from your diary.",
        href: "/stats",
        cta: "Open Stats",
        icon: BarChart2,
      },
      {
        id: "rewatch-guide",
        title: "Rewatches",
        summary: "Count every revisit.",
        detail:
          "From Watched or a film’s page, log a rewatch with an optional date. History shows times watched and dated entries.",
        href: "/watched",
        cta: "Open Watched",
        icon: RotateCcw,
      },
      {
        id: "vault-brand",
        title: "Film details",
        summary: "The deep page for any title in your vault.",
        detail:
          "Ratings, notes, where to watch, similar titles, language/version changes, and watch history live here.",
        href: "/watched",
        cta: "Browse vault",
        icon: Clapperboard,
      },
    ],
  },
];

export function isFeatureTourDone(): boolean {
  try {
    return localStorage.getItem(FEATURE_TOUR_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markFeatureTourDone(): void {
  try {
    localStorage.setItem(FEATURE_TOUR_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function resetFeatureTour(): void {
  try {
    localStorage.removeItem(FEATURE_TOUR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
