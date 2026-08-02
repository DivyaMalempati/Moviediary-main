import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  authFetch,
  ensureClerkApiSession,
  getAuthHeaders,
  getSyncSessionHeaders,
  hasClerkTokenGetter,
  isDemoMode,
  refreshGuestSession,
} from "./demo-auth";

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
  /** Films marked Not interested — hidden from Discover + Swipe. */
  dismissedTmdbIds: number[];
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
  dismissedTmdbIds: [],
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

/** Wait briefly for Clerk bridge / app token before treating as signed-out. */
async function waitForPreferencesAuth(maxMs = 2500): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (canCallPreferencesApi()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return canCallPreferencesApi();
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
    dismissedTmdbIds: Array.isArray(data.dismissedTmdbIds)
      ? data.dismissedTmdbIds.filter((id): id is number => Number.isInteger(id) && id > 0)
      : [],
  };
}

async function fetchPreferences(): Promise<UserPreferences> {
  if (!(await waitForPreferencesAuth())) {
    throw new PreferencesAuthError();
  }

  await ensureClerkApiSession();

  let res = await authFetch(`${API_BASE}/api/preferences`);

  // Demo/guest tokens go stale when SESSION_SECRET changes (e.g. local restarts).
  if (res.status === 401 && isDemoMode()) {
    await refreshGuestSession();
    res = await authFetch(`${API_BASE}/api/preferences`);
  }

  if (res.status === 401) throw new PreferencesAuthError();
  if (!res.ok) throw new Error("Failed to load preferences");
  return normalizePrefs(await res.json());
}

async function savePreferences(prefs: PreferencesInput): Promise<UserPreferences> {
  if (!(await waitForPreferencesAuth())) {
    throw new PreferencesAuthError();
  }

  await ensureClerkApiSession();

  const body = JSON.stringify({
    preferredLanguages: prefs.preferredLanguages,
    preferredGenres: prefs.preferredGenres,
    preferredProviders: prefs.preferredProviders ?? [],
    watchRegion: prefs.watchRegion ?? "IN",
    maxCertification: prefs.maxCertification ?? null,
    mutedGenres: prefs.mutedGenres ?? [],
  });

  const doPut = async () => {
    const headers = await getAuthHeaders({ "Content-Type": "application/json" });
    if (
      !isDemoMode() &&
      !headers.Authorization &&
      !headers["x-cinevault-token"]
    ) {
      throw new PreferencesAuthError();
    }
    return authFetch(`${API_BASE}/api/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
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
    // Auth can race the Clerk token bridge briefly — retry a couple times.
    retry: (count, err) => {
      if (err instanceof PreferencesAuthError) return count < 2;
      return count < 2;
    },
    retryDelay: (n) => 300 * (n + 1),
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

async function postDismiss(tmdbId: number): Promise<UserPreferences> {
  await ensureClerkApiSession();
  const res = await authFetch(`${API_BASE}/api/preferences/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmdbId }),
  });
  if (res.status === 401) throw new PreferencesAuthError();
  if (!res.ok) throw new Error("Failed to dismiss film");
  return normalizePrefs(await res.json());
}

async function clearDismissed(): Promise<UserPreferences> {
  await ensureClerkApiSession();
  const res = await authFetch(`${API_BASE}/api/preferences/dismiss`, {
    method: "DELETE",
  });
  if (res.status === 401) throw new PreferencesAuthError();
  if (!res.ok) throw new Error("Failed to clear dismissed films");
  return normalizePrefs(await res.json());
}

/** Persist "Not interested" so Discover and Swipe both hide the film. */
export function useDismissFilm() {
  const qc = useQueryClient();

  const dismiss = useCallback(
    async (tmdbId: number | null | undefined) => {
      if (tmdbId == null) return;
      // Optimistic local cache so Discover updates immediately.
      qc.setQueryData<UserPreferences>(["preferences"], (prev) => {
        const base = prev ?? defaultPreferences;
        if (base.dismissedTmdbIds.includes(tmdbId)) return base;
        return { ...base, dismissedTmdbIds: [tmdbId, ...base.dismissedTmdbIds] };
      });
      try {
        const next = await postDismiss(tmdbId);
        qc.setQueryData(["preferences"], next);
        return next;
      } catch (err) {
        void qc.invalidateQueries({ queryKey: ["preferences"] });
        throw err;
      }
    },
    [qc],
  );

  const clearAll = useCallback(async () => {
    const next = await clearDismissed();
    qc.setQueryData(["preferences"], next);
    return next;
  }, [qc]);

  return { dismiss, clearAll };
}

export type WatchProviderCatalogItem = {
  providerId: number;
  name: string;
  logoPath: string | null;
  displayPriority?: number;
};

/**
 * India-first streaming apps for Preferences when TMDB catalog is unreachable.
 * IDs match current TMDB watch/providers for region IN (JioHotstar replaced Hotstar/JioCinema).
 */
export const FALLBACK_PROVIDERS: WatchProviderCatalogItem[] = [
  { providerId: 8, name: "Netflix", logoPath: null, displayPriority: 1 },
  { providerId: 119, name: "Amazon Prime Video", logoPath: null, displayPriority: 2 },
  { providerId: 2336, name: "JioHotstar", logoPath: null, displayPriority: 3 },
  { providerId: 232, name: "Zee5", logoPath: null, displayPriority: 4 },
  { providerId: 237, name: "Sony Liv", logoPath: null, displayPriority: 5 },
  { providerId: 350, name: "Apple TV", logoPath: null, displayPriority: 6 },
  { providerId: 11, name: "MUBI", logoPath: null, displayPriority: 7 },
  { providerId: 192, name: "YouTube", logoPath: null, displayPriority: 8 },
];

export async function fetchWatchProviderCatalog(
  watchRegion = "IN",
): Promise<WatchProviderCatalogItem[]> {
  try {
    // Sync session headers only — do not await Clerk getToken (hangs on Replit).
    const res = await fetch(
      `${API_BASE}/api/tmdb/watch-provider-catalog?watchRegion=${encodeURIComponent(watchRegion)}`,
      { credentials: "include", headers: getSyncSessionHeaders() },
    );
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const data = (await res.json()) as WatchProviderCatalogItem[];
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty catalog");
    return data;
  } catch {
    return FALLBACK_PROVIDERS;
  }
}

export function useWatchProviderCatalog(watchRegion = "IN") {
  return useQuery({
    queryKey: ["watch-provider-catalog", watchRegion],
    queryFn: () => fetchWatchProviderCatalog(watchRegion),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

/** Popular India streaming services shown first in the picker. */
export const FEATURED_PROVIDER_IDS = [
  8, // Netflix
  119, // Amazon Prime Video
  2336, // JioHotstar (replaces Disney+ Hotstar / JioCinema in IN)
  122, // legacy Hotstar id (still matched if present)
  220, // legacy JioCinema id
  337, // Disney Plus (other regions)
  237, // Sony Liv
  232, // Zee5
  350, // Apple TV
  11, // MUBI
  192, // YouTube
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
