import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, isDemoMode, hasClerkTokenGetter, refreshGuestSession } from "./demo-auth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface UserPreferences {
  preferredLanguages: string[];
  preferredGenres: string[];
  preferredProviders: number[];
  watchRegion: string;
  onboardingCompletedAt: string | null;
}

export type PreferencesInput = {
  preferredLanguages: string[];
  preferredGenres: string[];
  preferredProviders?: number[];
  watchRegion?: string;
};

const defaultPreferences: UserPreferences = {
  preferredLanguages: [],
  preferredGenres: [],
  preferredProviders: [],
  watchRegion: "IN",
  onboardingCompletedAt: null,
};

export class PreferencesAuthError extends Error {
  constructor() {
    super("Session expired");
  }
}

function canCallPreferencesApi(): boolean {
  if (isDemoMode()) return true;
  if (hasClerkTokenGetter()) return true;
  if (typeof localStorage !== "undefined" && localStorage.getItem("cinevault:app-token")) {
    return true;
  }
  return false;
}

async function fetchPreferences(): Promise<UserPreferences> {
  // Avoid firing unauthenticated preference reads that get cached as "empty".
  if (!canCallPreferencesApi()) {
    throw new PreferencesAuthError();
  }

  const doGet = async () =>
    fetch(`${API_BASE}/api/preferences`, {
      credentials: "include",
      headers: await getAuthHeaders(),
    });

  let res = await doGet();

  // Demo/guest tokens go stale when SESSION_SECRET changes (e.g. local restarts).
  if (res.status === 401 && isDemoMode()) {
    await refreshGuestSession();
    res = await doGet();
  }

  if (res.status === 401) throw new PreferencesAuthError();
  if (!res.ok) throw new Error("Failed to load preferences");
  const data = await res.json();
  return {
    ...defaultPreferences,
    ...data,
    preferredProviders: Array.isArray(data.preferredProviders) ? data.preferredProviders : [],
    watchRegion: data.watchRegion || "IN",
  };
}

async function savePreferences(prefs: PreferencesInput): Promise<UserPreferences> {
  if (!canCallPreferencesApi()) {
    throw new PreferencesAuthError();
  }

  const doPut = async () => {
    const headers = await getAuthHeaders({ "Content-Type": "application/json" });
    if (
      !isDemoMode() &&
      !headers.Authorization &&
      !headers["x-cinevault-token"]
    ) {
      throw new PreferencesAuthError();
    }
    return fetch(`${API_BASE}/api/preferences`, {
      method: "PUT",
      credentials: "include",
      headers,
      body: JSON.stringify({
        preferredLanguages: prefs.preferredLanguages,
        preferredGenres: prefs.preferredGenres,
        preferredProviders: prefs.preferredProviders ?? [],
        watchRegion: prefs.watchRegion ?? "IN",
      }),
    });
  };

  let res = await doPut();

  if (res.status === 401 && isDemoMode()) {
    await refreshGuestSession();
    res = await doPut();
  }

  if (res.status === 401) throw new PreferencesAuthError();
  if (!res.ok) throw new Error("Failed to save preferences");
  const data = await res.json();
  return {
    ...defaultPreferences,
    ...data,
    preferredProviders: Array.isArray(data.preferredProviders) ? data.preferredProviders : [],
    watchRegion: data.watchRegion || "IN",
  };
}

export function usePreferences() {
  return useQuery({
    queryKey: ["preferences"],
    queryFn: fetchPreferences,
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => {
      if (err instanceof PreferencesAuthError) return false;
      return count < 2;
    },
  });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savePreferences,
    onSuccess: (data) => {
      qc.setQueryData(["preferences"], data);
    },
  });
}

export type WatchProviderCatalogItem = {
  providerId: number;
  name: string;
  logoPath: string | null;
  displayPriority?: number;
};

export async function fetchWatchProviderCatalog(watchRegion = "IN"): Promise<WatchProviderCatalogItem[]> {
  const res = await fetch(
    `${API_BASE}/api/tmdb/watch-provider-catalog?watchRegion=${encodeURIComponent(watchRegion)}`,
    { credentials: "include", headers: await getAuthHeaders() },
  );
  if (!res.ok) return [];
  return res.json();
}

export function useWatchProviderCatalog(watchRegion = "IN") {
  return useQuery({
    queryKey: ["watch-provider-catalog", watchRegion],
    queryFn: () => fetchWatchProviderCatalog(watchRegion),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

/** Popular India streaming services shown first in the picker. */
export const FEATURED_PROVIDER_IDS = [
  8,    // Netflix
  119,  // Amazon Prime Video
  122,  // Hotstar / Disney+ Hotstar
  337,  // Disney Plus
  220,  // JioCinema
  237,  // Sony LIV
  232,  // Zee5
  350,  // Apple TV
  11,   // MUBI
];
