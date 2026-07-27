import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGuestHeaders } from "./demo-auth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface UserPreferences {
  preferredLanguages: string[];
  preferredGenres: string[];
  onboardingCompletedAt: string | null;
}

const defaultPreferences: UserPreferences = {
  preferredLanguages: [],
  preferredGenres: [],
  onboardingCompletedAt: null,
};

// ── API helpers ──────────────────────────────────────────────────────────────
// Guest users now get real isolated DB rows (via x-guest-token), so no
// localStorage fallback is needed — preferences are stored server-side for
// both Clerk users and guests alike.

async function fetchPreferences(): Promise<UserPreferences> {
  const res = await fetch(`${API_BASE}/api/preferences`, {
    credentials: "include",
    headers: { ...getGuestHeaders() },
  });
  if (!res.ok) return defaultPreferences;
  return res.json();
}

export class PreferencesAuthError extends Error {
  constructor() { super("Session expired"); }
}

async function savePreferences(prefs: { preferredLanguages: string[]; preferredGenres: string[] }): Promise<UserPreferences> {
  const res = await fetch(`${API_BASE}/api/preferences`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getGuestHeaders() },
    body: JSON.stringify(prefs),
  });
  if (res.status === 401) throw new PreferencesAuthError();
  if (!res.ok) throw new Error("Failed to save preferences");
  return res.json();
}

// ── Hooks ────────────────────────────────────────────────────────────────────
export function usePreferences() {
  return useQuery({
    queryKey: ["preferences"],
    queryFn: fetchPreferences,
    staleTime: 5 * 60 * 1000,
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
