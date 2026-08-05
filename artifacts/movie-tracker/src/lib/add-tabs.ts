import {
  DISCOVER_TAB_IDS,
  isDiscoverTab,
  type DiscoverTabId,
} from "@/components/discover-content";

export type AddTabId = "log" | DiscoverTabId;

export type AddPrimaryMode = "log" | "discover";

export const DISCOVER_SUBTABS: Array<{
  id: DiscoverTabId;
  label: string;
  shortLabel: string;
}> = [
  { id: "search", label: "Search", shortLabel: "Search" },
  { id: "foryou", label: "For You", shortLabel: "For You" },
  { id: "trending", label: "Trending", shortLabel: "Trending" },
];

export function parseAddTab(value: string | null | undefined): AddTabId {
  if (value === "log" || !value) return "log";
  // Convenience alias used by sidebar / deep links wanting Discover default.
  if (value === "discover") return "search";
  // Legacy deep links from older Actor / Liked tabs.
  if (value === "people") return "search";
  if (value === "liked") return "foryou";
  if (isDiscoverTab(value)) return value;
  return "log";
}

export function addTabHref(tab: AddTabId): string {
  return tab === "log" ? "/add" : `/add?tab=${tab}`;
}

/** Read `?tab=` from the current location (wouter path omits search). */
export function readAddTabFromWindow(): AddTabId {
  if (typeof window === "undefined") return "log";
  return parseAddTab(new URLSearchParams(window.location.search).get("tab"));
}

export function isDiscoverAddTab(tab: AddTabId): tab is DiscoverTabId {
  return tab !== "log";
}

export function primaryModeForTab(tab: AddTabId): AddPrimaryMode {
  return tab === "log" ? "log" : "discover";
}

export function defaultDiscoverTab(
  preferred: DiscoverTabId | null | undefined = "search",
): DiscoverTabId {
  if (preferred && DISCOVER_TAB_IDS.includes(preferred)) return preferred;
  return "search";
}
