/**
 * MVP feature surface — keep main stable by shipping only proven pages.
 *
 * Secondary surfaces stay in the codebase on feature branches / behind flags.
 * Turn a flag on only after that feature has its own green branch + PR.
 *
 * Override: set VITE_ENABLE_LABS=1 to show every page (labs/debug).
 */

export type AppFeature =
  | "watched"
  | "watchlist"
  | "swipe"
  | "add"
  | "together"
  | "profile"
  | "guide"
  | "movieDetails"
  | "discover"
  | "upcoming"
  | "collections"
  | "stats"
  | "import";

const labsEnabled = import.meta.env.VITE_ENABLE_LABS === "1";

/** Features shipped in the stable MVP build. */
const MVP_FEATURES: ReadonlySet<AppFeature> = new Set([
  "watched",
  "watchlist",
  "swipe",
  "add",
  "together",
  "profile",
  "guide",
  "movieDetails",
  "upcoming",
  "discover",
  "collections",
  "import",
]);

/** Lab / secondary features — hidden from nav until their own branch is ready. */
const LAB_FEATURES: ReadonlySet<AppFeature> = new Set([
  "stats",
]);

export function isFeatureEnabled(feature: AppFeature): boolean {
  if (MVP_FEATURES.has(feature)) return true;
  if (labsEnabled && LAB_FEATURES.has(feature)) return true;
  return false;
}

/** Path → feature for route gating. Unknown paths stay reachable (404 handles them). */
const PATH_FEATURES: Array<{ prefix: string; feature: AppFeature }> = [
  { prefix: "/suggestions", feature: "discover" },
  { prefix: "/upcoming", feature: "upcoming" },
  { prefix: "/collections", feature: "collections" },
  { prefix: "/stats", feature: "stats" },
  { prefix: "/import", feature: "import" },
  { prefix: "/partner", feature: "together" },
  { prefix: "/pair", feature: "together" },
  { prefix: "/match", feature: "together" },
  { prefix: "/swipe", feature: "swipe" },
  { prefix: "/add", feature: "add" },
  { prefix: "/guide", feature: "guide" },
  { prefix: "/watched", feature: "watched" },
  { prefix: "/watchlist", feature: "watchlist" },
  { prefix: "/profile", feature: "profile" },
  { prefix: "/movie", feature: "movieDetails" },
];

export function featureForPath(path: string): AppFeature | null {
  const bare = path.split("?")[0] || "/";
  for (const { prefix, feature } of PATH_FEATURES) {
    if (bare === prefix || bare.startsWith(`${prefix}/`)) return feature;
  }
  return null;
}

export function isPathEnabled(path: string): boolean {
  const feature = featureForPath(path);
  if (!feature) return true;
  return isFeatureEnabled(feature);
}

export type NavItem = {
  href: string;
  label: string;
  feature: AppFeature;
};

/** Desktop sidebar — Add (Log) + Discover; Together lives under Profile. */
export const SIDEBAR_NAV: NavItem[] = [
  { href: "/watched", label: "Watched", feature: "watched" },
  { href: "/watchlist", label: "Watchlist", feature: "watchlist" },
  { href: "/swipe", label: "Swipe", feature: "swipe" },
  { href: "/add", label: "Add", feature: "add" },
  { href: "/add?tab=search", label: "Discover", feature: "discover" },
  { href: "/upcoming", label: "Upcoming", feature: "upcoming" },
  { href: "/guide", label: "Guide", feature: "guide" },
  // Labs
  { href: "/collections", label: "Collections", feature: "collections" },
  { href: "/stats", label: "Stats", feature: "stats" },
  { href: "/import", label: "Import", feature: "import" },
];

/** Mobile bottom bar — Add instead of Together (Together is on Profile). */
export const BOTTOM_NAV: NavItem[] = [
  { href: "/watched", label: "Watched", feature: "watched" },
  { href: "/watchlist", label: "Watchlist", feature: "watchlist" },
  { href: "/swipe", label: "Swipe", feature: "swipe" },
  { href: "/add", label: "Add", feature: "add" },
  { href: "/profile", label: "Profile", feature: "profile" },
];

export function enabledNav(items: NavItem[]): NavItem[] {
  return items.filter((item) => isFeatureEnabled(item.feature));
}
