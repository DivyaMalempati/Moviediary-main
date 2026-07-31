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
export const FEATURE_TOUR_VERSION = 3;
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

/**
 * First-visit walkthrough — MVP only.
 * Each step explains the page and the main buttons.
 */
export const FEATURE_TOUR_STEPS: FeatureGuideItem[] = [
  {
    id: "watched",
    title: "Watched",
    summary: "Your diary of films you’ve already seen.",
    detail:
      "Open any poster for rating, notes, and details. Use filters/search to find a title. This is home after you sign in.",
    href: "/watched",
    cta: "Open Watched",
    icon: Eye,
  },
  {
    id: "watchlist",
    title: "Watchlist",
    summary: "Films you’re saving for later.",
    detail:
      "From a poster, mark Watched (with a rating) when you finish it. Bottom nav → Watchlist.",
    href: "/watchlist",
    cta: "Open Watchlist",
    icon: Bookmark,
  },
  {
    id: "swipe",
    title: "Swipe",
    summary: "A short deck mixed for your taste — not endless scroll.",
    detail:
      "First visit: set your own genres & languages. Then swipe — left skips, right saves to Watchlist, up logs as Watched. Solo only (not movie night).",
    href: "/swipe",
    cta: "Open Swipe",
    icon: Shuffle,
  },
  {
    id: "together",
    title: "Together",
    summary: "Movie night with a friend — shared deck, mutual likes.",
    detail:
      "Create invite link → they join → tap Start movie night & swipe. That opens /match/… where you both swipe. Bottom-nav Swipe stays solo.",
    href: "/partner",
    cta: "Open Together",
    icon: Users,
  },
  {
    id: "add-profile",
    title: "Add & Profile",
    summary: "Search to add titles; Preferences shape every deck.",
    detail:
      "Add: search TMDB and save to Watched or Watchlist. Profile: Preferences (genres, languages, streaming), export, sign out, and this guide.",
    href: "/add",
    cta: "Add a film",
    icon: PlusCircle,
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
        id: "nav-together",
        title: "Together",
        summary: "Shared movie-night ritual.",
        detail:
          "1) Preferences (each person, own account) · 2) Create invite link · 3) After you’re paired, Together shows a big Start movie night & swipe button · 4) Mutual likes = tonight’s shortlist. Share the /match/… link so you swipe the same deck.",
        href: "/partner",
        cta: "Open Together",
        icon: Users,
      },
      {
        id: "nav-profile",
        title: "Profile",
        summary: "Account, Preferences, guide, export.",
        detail:
          "Preferences set languages, genres, and streaming apps. Replay walkthrough and open this Guide from here. Sign out / exit demo also live here.",
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
        id: "action-add",
        title: "Add a film",
        summary: "Search and add to Watched or Watchlist.",
        detail:
          "Sidebar → Add (or Profile → Add a film). Type at least 2 characters. Optional: limit results to your streaming services from Preferences.",
        href: "/add",
        cta: "Add a film",
        icon: PlusCircle,
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
