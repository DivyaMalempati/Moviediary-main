import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders, isDemoMode, hasClerkTokenGetter, refreshGuestSession } from "./demo-auth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** India CBFC max certification for recommendations. */
export type MaxCertification = "U" | "UA" | "A";

export interface UserPreferences {
  preferredLanguages: string[];
  preferredGenres: string[];
  preferredProviders: number[];
  watchRegion: string;
  maxCertification: MaxCertification | null;
  mutedGenres: string[];
  onboardingCompletedAt: string | null;
}

export type PreferencesInput = {
  preferredLanguages: string[];
  preferredGenres: string[];
  preferredProviders?: number[];
  watchRegion?: string;
  maxCertification?: MaxCertification | null;
  mutedGenres?: string[];
};

const defaultPreferences: UserPreferences = {
  preferredLanguages: [],
  preferredGenres: [],
  preferredProviders: [],
  watchRegion: "IN",
  maxCertification: null,
  mutedGenres: [],
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

function normalizePrefs(data: Partial<UserPreferences>): UserPreferences {
  const cert = data.maxCertification;
  const maxCertification =
    cert === "U" || cert === "UA" || cert === "A" ? cert : null;
  return {
    ...defaultPreferences,
    ...data,
    preferredProviders: Array.isArray(data.preferredProviders) ? data.preferredProviders : [],
    watchRegion: data.watchRegion || "IN",
    maxCertification,
    mutedGenres: Array.isArray(data.mutedGenres) ? data.mutedGenres : [],
  };
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
  return normalizePrefs(await res.json());
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
        maxCertification: prefs.maxCertification ?? null,
        mutedGenres: prefs.mutedGenres ?? [],
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
  return normalizePrefs(await res.json());
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

/** Mute genres so Discover/Swipe stop recommending films like this. */
export function useMuteGenres() {
  const { data: prefs } = usePreferences();
  const { mutateAsync, isPending } = useSavePreferences();

  const muteGenres = async (genres: string[]) => {
    if (!genres.length) return prefs;
    const existing = prefs?.mutedGenres ?? [];
    const next = [...existing];
    for (const g of genres) {
      if (!next.some((x) => x.toLowerCase() === g.toLowerCase())) next.push(g);
    }
    return mutateAsync({
      preferredLanguages: prefs?.preferredLanguages ?? [],
      preferredGenres: prefs?.preferredGenres ?? [],
      preferredProviders: prefs?.preferredProviders ?? [],
      watchRegion: prefs?.watchRegion ?? "IN",
      maxCertification: prefs?.maxCertification ?? null,
      mutedGenres: next,
    });
  };

  return { muteGenres, isPending };
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

export const CERTIFICATION_OPTIONS: {
  value: MaxCertification | null;
  label: string;
  hint: string;
}[] = [
  { value: null, label: "Any age", hint: "No certification filter" },
  { value: "U", label: "U", hint: "Universal / family" },
  { value: "UA", label: "UA & under", hint: "Parental guidance" },
  { value: "A", label: "A included", hint: "Adults allowed" },
];
