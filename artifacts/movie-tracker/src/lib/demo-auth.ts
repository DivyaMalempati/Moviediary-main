import { setExtraHeaders, clearExtraHeaders, setAuthTokenGetter } from "@workspace/api-client-react";

const DEMO_KEY        = "cinevault:demo";
const GUEST_TOKEN_KEY = "cinevault:guest-token";
const BASE            = import.meta.env.BASE_URL.replace(/\/$/, "");

type TokenGetter = () => Promise<string | null> | string | null;

let clerkTokenGetter: TokenGetter | null = null;

export function isDemoMode(): boolean {
  return localStorage.getItem(DEMO_KEY) === "1";
}

/**
 * Register Clerk's getToken for authenticated API calls.
 * Required on proxied / cross-origin hosts where session cookies aren't enough
 * (Clerk reports X-Clerk-Auth-Reason: dev-browser-missing).
 */
export function setClerkTokenGetter(getter: TokenGetter | null): void {
  clerkTokenGetter = getter;
  setAuthTokenGetter(getter);
}

/**
 * Returns the x-guest-token header for raw fetch() calls.
 * Only sent while demo mode is active — never for signed-in Clerk users,
 * even if a stale guest token remains in localStorage.
 */
export function getGuestHeaders(): Record<string, string> {
  if (!isDemoMode()) return {};
  const token = localStorage.getItem(GUEST_TOKEN_KEY);
  return token ? { "x-guest-token": token } : {};
}

/** Guest headers + Clerk Bearer token when signed in. */
export async function getAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...getGuestHeaders(), ...extra };
  if (clerkTokenGetter) {
    const token = await clerkTokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Start a guest session.
 * - If a session already exists (returning visitor), reuses it so data is preserved.
 * - Otherwise requests a fresh signed token from the server.
 * - Must be awaited before navigating into the app.
 */
export async function enableDemoMode(): Promise<void> {
  const existingToken = localStorage.getItem(GUEST_TOKEN_KEY);
  if (existingToken && localStorage.getItem(DEMO_KEY) === "1") {
    // Returning guest — restore headers and continue
    setExtraHeaders({ "x-guest-token": existingToken });
    return;
  }

  const res = await fetch(`${BASE}/api/guest-session`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create guest session");
  const { token } = await res.json();

  localStorage.setItem(DEMO_KEY, "1");
  localStorage.setItem(GUEST_TOKEN_KEY, token);
  setExtraHeaders({ "x-guest-token": token });
}

/** Clear the guest session and return to the landing page. */
export function disableDemoMode(): void {
  localStorage.removeItem(DEMO_KEY);
  localStorage.removeItem(GUEST_TOKEN_KEY);
  clearExtraHeaders();
}

/** Call once on app startup to restore an existing guest session from localStorage. */
export function initDemoMode(): void {
  if (isDemoMode()) {
    const token = localStorage.getItem(GUEST_TOKEN_KEY);
    if (token) setExtraHeaders({ "x-guest-token": token });
  } else {
    // Avoid a stale guest token hijacking Clerk-authenticated API calls.
    clearExtraHeaders();
    localStorage.removeItem(GUEST_TOKEN_KEY);
  }
}
