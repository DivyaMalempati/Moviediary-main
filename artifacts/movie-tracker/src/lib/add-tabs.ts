import { isDiscoverTab, type DiscoverTabId } from "@/components/discover-content";

export type AddTabId = "log" | DiscoverTabId;

export function parseAddTab(value: string | null | undefined): AddTabId {
  if (value === "log" || !value) return "log";
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
