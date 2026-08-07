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
  FolderOpen,
} from "lucide-react";
import { isFeatureEnabled } from "@/lib/features";

/**
 * Content version — bump when rewriting tips (for docs only).
 * Auto-open uses FEATURE_TOUR_DONE_KEY and must NOT re-fire when this bumps.
 */
export const FEATURE_TOUR_VERSION = 10;
/** Stable “completed once” flag — first login only; survives tip/content updates. */
export const FEATURE_TOUR_DONE_KEY = "cinevault:feature-tour:done";
/** @deprecated legacy per-version keys; still honored so upgrades don’t re-show the tour */
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
 * Auto-opens once after first login (taste onboarding), never again unless Replay.
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
    tip: "Open Add to log what you watched — or browse Discover for new picks.",
    href: "/add",
    target: "nav-add",
  },
  {
    id: "add-log",
    title: "Log",
    tip: "Log is for your diary. Switch to Discover anytime from this toggle.",
    href: "/add",
    target: "add-primary-modes",
  },
  {
    id: "add-title-search",
    title: "Title search",
    tip: "Search by film title — India or Global — then mark Watched (optional diary blanks) or save to Watchlist.",
    href: "/add",
    target: "add-title-search",
  },
  {
    id: "add-discover",
    title: "Discover",
    tip: "Tap Discover to browse — then use Search, For You, or Trending.",
    href: "/add?tab=search",
    target: "add-discover-mode",
  },
  {
    id: "add-search",
    title: "Search",
    tip: "Actor, Film, Like this, or Vibe — find something, then log or save.",
    href: "/add?tab=search",
    target: "add-discover-chip-search",
  },
  {
    id: "add-foryou",
    title: "For You",
    tip: "Picks shaped by your taste — languages, genres, and what you’ve loved.",
    href: "/add?tab=foryou",
    target: "add-discover-chip-foryou",
  },
  {
    id: "add-trending",
    title: "Trending",
    tip: "What’s popular right now. Filter by language if you want a tighter list.",
    href: "/add?tab=trending",
    target: "add-discover-chip-trending",
  },
  {
    id: "profile",
    title: "Profile",
    tip: "Your account hub — Together, Preferences, export, and replay this tour anytime.",
    href: "/profile",
    target: "nav-profile",
  },
  {
    id: "profile-together",
    title: "Together",
    tip: "Invite someone by name, then start a movie night and swipe the same deck.",
    href: "/profile",
    target: "profile-together",
  },
  {
    id: "collections",
    title: "Collections",
    tip: "Group films into lists. Make a list public to share, or keep it private.",
    href: "/collections",
    target: "collections-heading",
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
          "Left = skip · Right = Watchlist · Up = Watched. Filters: genre / streaming. Tropes live under Discover → Search → Vibe. Not used for movie night.",
        href: "/swipe",
        cta: "Open Swipe",
        icon: Shuffle,
      },
      {
        id: "nav-add",
        title: "Add",
        summary: "Log a film or browse Discover.",
        detail:
          "Bottom bar → Add. Primary: Log | Discover. On Log: search by title, then Watched (optional diary blanks) or Watchlist. On Discover: Search, For You, Trending.",
        href: "/add",
        cta: "Add a film",
        icon: PlusCircle,
      },
      {
        id: "nav-profile",
        title: "Profile",
        summary: "Account, Together, Preferences, Collections tab, guide, export.",
        detail:
          "Open Together for movie nights. Preferences set languages, genres, and streaming apps. The Collections tab lists your lists; Manage opens the full Collections page. Replay walkthrough and open the Guide from here.",
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
        id: "action-collections",
        title: "Collections",
        summary: "Custom lists of films — private or shareable.",
        detail:
          "Create manual lists or smart rules. Toggle Public to get a share link; viewers can copy films into their watchlist. Also reachable from Profile → Collections.",
        href: "/collections",
        cta: "Open Collections",
        icon: FolderOpen,
        feature: "collections",
      },
      {
        id: "action-discover",
        title: "Discover",
        summary: "Search, For You, and Trending — on Add → Discover.",
        detail:
          "Add → Discover (or sidebar Discover). Sub-tabs: Search (Actor / Film / Like this / Vibe), For You, Trending.",
        href: "/add?tab=search",
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
          "Open from Watched, Watchlist, or Swipe. Edit rating/notes, see where to watch, similar titles, share, or remove. Add the film to a collection from here.",
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

function legacyTourKeysDone(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("cinevault:feature-tour:v") && localStorage.getItem(key) === "1") {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** True once the user has finished or skipped the first-login walkthrough. */
export function isFeatureTourDone(): boolean {
  try {
    if (localStorage.getItem(FEATURE_TOUR_DONE_KEY) === "1") return true;
    if (legacyTourKeysDone()) {
      localStorage.setItem(FEATURE_TOUR_DONE_KEY, "1");
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function markFeatureTourDone(): void {
  try {
    localStorage.setItem(FEATURE_TOUR_DONE_KEY, "1");
    // Keep current version key in sync for older readers.
    localStorage.setItem(FEATURE_TOUR_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function resetFeatureTour(): void {
  try {
    localStorage.removeItem(FEATURE_TOUR_DONE_KEY);
    localStorage.removeItem(FEATURE_TOUR_STORAGE_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("cinevault:feature-tour:v")) {
        localStorage.removeItem(key);
      }
    }
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
    case "/collections":
      return "nav-collections";
    case "/add":
      return "nav-add";
    case "/add?tab=search":
    case "/add?tab=people":
      return "nav-discover";
    case "/suggestions":
      return "nav-discover";
    case "/guide":
      return "nav-guide";
    default:
      return undefined;
  }
}
