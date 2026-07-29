import { setExtraHeaders, clearExtraHeaders, setAuthTokenGetter } from "@workspace/api-client-react";

const DEMO_KEY        = "cinevault:demo";
const GUEST_TOKEN_KEY = "cinevault:guest-token";
const APP_TOKEN_KEY   = "cinevault:app-token";
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
  // Keep first-party app token in extra headers for api-client-react hooks.
  syncExtraAuthHeaders();
}

/** Whether a Clerk token getter is currently registered (signed-in path). */
export function hasClerkTokenGetter(): boolean {
  return clerkTokenGetter != null;
}

function syncExtraAuthHeaders(): void {
  if (isDemoMode()) {
    const guest = localStorage.getItem(GUEST_TOKEN_KEY);
    if (guest) setExtraHeaders({ "x-guest-token": guest });
    else clearExtraHeaders();
    return;
  }

  const appToken = localStorage.getItem(APP_TOKEN_KEY);
  if (appToken) {
    setExtraHeaders({ "x-cinevault-token": appToken });
  } else {
    clearExtraHeaders();
  }
}

/**
 * Exchange a Clerk Bearer JWT for a first-party app session token.
 * Call once after sign-in when getToken() succeeds.
 */
export async function establishAppSession(clerkJwt: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/clerk-session`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${clerkJwt}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token?: string };
    if (!data.token) return false;
    localStorage.setItem(APP_TOKEN_KEY, data.token);
    syncExtraAuthHeaders();
    return true;
  } catch {
    return false;
  }
}

export function clearAppSession(): void {
  localStorage.removeItem(APP_TOKEN_KEY);
  if (!isDemoMode()) clearExtraHeaders();
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

function getAppSessionHeaders(): Record<string, string> {
  if (isDemoMode()) return {};
  const token = localStorage.getItem(APP_TOKEN_KEY);
  return token ? { "x-cinevault-token": token } : {};
}

async function resolveClerkToken(): Promise<string | null> {
  if (!clerkTokenGetter) return null;

  let token = await clerkTokenGetter();
  if (token) return token;

  // Session may still be hydrating after Google redirect — brief retry.
  for (let i = 0; i < 8 && !token; i++) {
    await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    token = await clerkTokenGetter();
  }
  return token;
}

/** Guest / app-session headers + Clerk Bearer token when signed in. */
export async function getAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    ...getGuestHeaders(),
    ...getAppSessionHeaders(),
    ...extra,
  };
  const token = await resolveClerkToken();
  if (token) headers.Authorization = `Bearer ${token}`;
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
  localStorage.removeItem(APP_TOKEN_KEY);
  setExtraHeaders({ "x-guest-token": token });
}

/** Clear the guest session and return to the landing page. */
export function disableDemoMode(): void {
  localStorage.removeItem(DEMO_KEY);
  localStorage.removeItem(GUEST_TOKEN_KEY);
  clearExtraHeaders();
  syncExtraAuthHeaders();
}

/** Call once on app startup to restore an existing guest session from localStorage. */
export function initDemoMode(): void {
  if (isDemoMode()) {
    const token = localStorage.getItem(GUEST_TOKEN_KEY);
    if (token) setExtraHeaders({ "x-guest-token": token });
    localStorage.removeItem(APP_TOKEN_KEY);
  } else {
    // Avoid a stale guest token hijacking Clerk-authenticated API calls.
    localStorage.removeItem(GUEST_TOKEN_KEY);
    syncExtraAuthHeaders();
  }
}
