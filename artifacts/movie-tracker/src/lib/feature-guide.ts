import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  Eye,
  PlusCircle,
  Shuffle,
  Users,
  Settings,
  Clapperboard,
  User,
} from "lucide-react";
import { isFeatureEnabled } from "@/lib/features";

/** Bump when the tour content changes so returning users see the new version once. */
export const FEATURE_TOUR_VERSION = 5;
export const FEATURE_TOUR_STORAGE_KEY = `cinevault:feature-tour:v${FEATURE_TOUR_VERSION}`;

export type FeatureGuideItem = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  href: string;
  cta: string;
  icon: LucideIcon;
  /** Optional feature flag — omitted items always show in the guide. */
  feature?: Parameters<typeof isFeatureEnabled>[0];
};

export type FeatureTourStep = {
  id: string;
  title: string;
  /** One short line shown in the coach-mark bubble. */
  tip: string;
  href: string;
  /** Matches `data-tour` on the nav / UI control to spotlight. */
  target: string;
  cta?: string;
};

/**
 * Spotlight walkthrough — points at real bottom-nav / sidebar icons.
 * Keep tips short; the highlight does the explaining.
 */
export const FEATURE_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: "watched",
    title: "Watched",
    tip: "Your diary — films you’ve already seen. Tap a poster to rate or add notes.",
    href: "/watched",
    target: "nav-watched",
  },
  {
    id: "watchlist",
    title: "Watchlist",
    tip: "Saved for later. Mark Watched when you finish one.",
    href: "/watchlist",
    target: "nav-watchlist",
  },
  {
    id: "swipe",
    title: "Swipe",
    tip: "Solo deck for you. Left skips · right saves · up logs as Watched.",
    href: "/swipe",
    target: "nav-swipe",
  },
  {
    id: "add",
    title: "Add",
    tip: "Search by title and log a film. Hero / Director search lives on Discover.",
    href: "/add",
    target: "nav-add",
  },
  {
    id: "profile",
    title: "Profile",
    tip: "Preferences, Together movie nights, export, and this guide.",
    href: "/profile",
    target: "nav-profile",
    cta: "Got it",
  },
];

/** Full reference guide — MVP pages + what each main control does. */
export const FEATURE_GUIDE_SECTIONS: Array<{
  heading: string;
  items: FeatureGuideItem[];
}> = [
  {
    heading: "Bottom navigation",
    items: [
      {
        id: "nav-watched",
        title: "Watched",
        summary: "Films you’ve logged as seen.",
        detail:
          "Tap a poster → film details. Search/filter at the top. Rewatch lives on the film page / Watched actions when available.",
        href: "/watched",
        cta: "Go to Watched",
        icon: Eye,
      },
      {
        id: "nav-watchlist",
        title: "Watchlist",
        summary: "Saved for later.",
        detail:
          "Rate or mark watched from the list to move a title into your diary.",
        href: "/watchlist",
        cta: "Go to Watchlist",
        icon: Bookmark,
      },
      {
        id: "nav-swipe",
        title: "Swipe (solo)",
        summary: "Your private recommendation deck.",
        detail:
          "Left = skip · Right = Watchlist · Up = Watched. Filters: genre / trope / streaming. Not used for movie night.",
        href: "/swipe",
        cta: "Open Swipe",
        icon: Shuffle,
      },
      {
        id: "nav-add",
        title: "Add",
        summary: "Search by title and log a film.",
        detail:
          "Bottom bar → Add. Title search only. For a hero or director’s filmography, use Discover → Hero / Director.",
        href: "/add",
        cta: "Add a film",
        icon: PlusCircle,
      },
      {
        id: "nav-profile",
        title: "Profile",
        summary: "Account, Together, Preferences, guide, export.",
        detail:
          "Open Together from here for movie nights. Preferences set languages, genres, and streaming apps. Replay walkthrough and open this Guide from here.",
        href: "/profile",
        cta: "Open Profile",
        icon: User,
      },
    ],
  },
  {
    heading: "Key actions",
    items: [
      {
        id: "action-together",
        title: "Together",
        summary: "Movie night with named people you invite.",
        detail:
          "Profile → Together. Name who you’re inviting (e.g. Priya), share the link, then Start movie night & swipe the same deck. People you’ve invited lists each person → pending/paired → swipe sessions.",
        href: "/partner",
        cta: "Open Together",
        icon: Users,
      },
      {
        id: "action-discover",
        title: "Discover",
        summary: "Hero / Director search plus India picks.",
        detail:
          "Sidebar → Discover. First tab: search actors or directors and add from their filmography. Other tabs: trending, because you liked, and AI picks.",
        href: "/suggestions",
        cta: "Open Discover",
        icon: Clapperboard,
        feature: "discover",
      },
      {
        id: "action-prefs",
        title: "Preferences",
        summary: "Your taste — never fill in for your partner.",
        detail:
          "Profile → Preferences. Each person keeps their own genres & languages. Together builds the shared deck from both profiles.",
        href: "/profile",
        cta: "Open Profile",
        icon: Settings,
      },
      {
        id: "action-details",
        title: "Film details",
        summary: "Deep page for any title in your vault.",
        detail:
          "Open from Watched, Watchlist, or Swipe. Edit rating/notes, see where to watch, similar titles, share, or remove.",
        href: "/watched",
        cta: "Browse Watched",
        icon: Clapperboard,
      },
    ],
  },
];

export function visibleGuideSections() {
  return FEATURE_GUIDE_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.feature || isFeatureEnabled(item.feature),
    ),
  })).filter((section) => section.items.length > 0);
}

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

/** Map nav href → data-tour id used by the spotlight. */
export function tourTargetForHref(href: string): string | undefined {
  switch (href) {
    case "/watched":
      return "nav-watched";
    case "/watchlist":
      return "nav-watchlist";
    case "/swipe":
      return "nav-swipe";
    case "/partner":
      return "nav-together";
    case "/profile":
      return "nav-profile";
    case "/add":
      return "nav-add";
    case "/suggestions":
      return "nav-discover";
    case "/guide":
      return "nav-guide";
    default:
      return undefined;
  }
}
