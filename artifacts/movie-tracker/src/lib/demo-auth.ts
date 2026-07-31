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

/**
 * Guest / app-session headers + Clerk Bearer token when signed in.
 * When a Clerk JWT is available, never send guest headers — a leftover
 * demo token must not take priority over a real account on the API.
 */
export async function getAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await resolveClerkToken();
  const headers: Record<string, string> = { ...extra };

  if (token) {
    // Signed-in path: Bearer + optional first-party app session. No guest.
    if (isDemoMode()) {
      localStorage.removeItem(DEMO_KEY);
      localStorage.removeItem(GUEST_TOKEN_KEY);
      syncExtraAuthHeaders();
    }
    Object.assign(headers, getAppSessionHeaders());
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  Object.assign(headers, getGuestHeaders(), getAppSessionHeaders());
  return headers;
}

/**
 * Ensure we have a usable API session for a signed-in Clerk user.
 * Always remints x-cinevault-token from the current Clerk JWT so a dead
 * token after SESSION_SECRET rotation can't block Together invites.
 */
export async function ensureClerkApiSession(): Promise<boolean> {
  const token = await resolveClerkToken();
  if (!token) return Boolean(localStorage.getItem(APP_TOKEN_KEY));

  if (isDemoMode()) {
    localStorage.removeItem(DEMO_KEY);
    localStorage.removeItem(GUEST_TOKEN_KEY);
  }

  return establishAppSession(token);
}

/**
 * fetch() with auth headers. On 401, drop a stale app token, remint from
 * Clerk Bearer, and retry once — covers SESSION_SECRET rotations on Replit.
 */
export async function authFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const mergeHeaders = async () => {
    const auth = await getAuthHeaders();
    const extra = init?.headers;
    if (!extra) return auth;
    if (extra instanceof Headers) {
      const out = { ...auth };
      extra.forEach((v, k) => {
        out[k] = v;
      });
      return out;
    }
    return { ...auth, ...(extra as Record<string, string>) };
  };

  let res = await fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: await mergeHeaders(),
  });

  if (res.status !== 401) return res;

  const clerkJwt = await resolveClerkToken();
  if (!clerkJwt) return res;

  clearAppSession();
  localStorage.removeItem(GUEST_TOKEN_KEY);
  if (isDemoMode()) localStorage.removeItem(DEMO_KEY);
  await establishAppSession(clerkJwt);

  res = await fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: await mergeHeaders(),
  });
  return res;
}

async function mintGuestToken(): Promise<string> {
  const res = await fetch(`${BASE}/api/guest-session`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create guest session");
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem(DEMO_KEY, "1");
  localStorage.setItem(GUEST_TOKEN_KEY, token);
  localStorage.removeItem(APP_TOKEN_KEY);
  setExtraHeaders({ "x-guest-token": token });
  return token;
}

/** True when the stored guest token is accepted by the API. */
async function isGuestTokenValid(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/preferences`, {
      headers: { "x-guest-token": token },
      credentials: "include",
    });
    // 200 = valid guest. Anything else (esp. 401) means mint a new token.
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Start a guest session.
 * - Reuses an existing token only if the server still accepts it
 *   (SESSION_SECRET rotations otherwise leave a dead token in localStorage).
 * - Otherwise requests a fresh signed token from the server.
 * - Must be awaited before navigating into the app.
 */
export async function enableDemoMode(): Promise<void> {
  const existingToken = localStorage.getItem(GUEST_TOKEN_KEY);
  if (existingToken && localStorage.getItem(DEMO_KEY) === "1") {
    if (await isGuestTokenValid(existingToken)) {
      setExtraHeaders({ "x-guest-token": existingToken });
      return;
    }
    // Stale / invalid token — drop it and mint a fresh session.
    localStorage.removeItem(GUEST_TOKEN_KEY);
  }

  await mintGuestToken();
}

/**
 * Force a new guest session. Use after a 401 in demo mode so the user can
 * continue without a hard refresh / Clerk sign-in.
 */
export async function refreshGuestSession(): Promise<void> {
  localStorage.removeItem(GUEST_TOKEN_KEY);
  await mintGuestToken();
}

/** Clear the guest session and return to the landing page. */
export function disableDemoMode(): void {
  localStorage.removeItem(DEMO_KEY);
  localStorage.removeItem(GUEST_TOKEN_KEY);
  clearExtraHeaders();
  syncExtraAuthHeaders();
}

/**
 * Leave demo/guest mode and hard-navigate to Clerk sign-in.
 * Always use this (not a soft Link) so demo headers/tokens can't stick around
 * and block Google sign-in on Replit preview hosts.
 */
export function exitDemoToSignIn(): void {
  disableDemoMode();
  clearAppSession();
  localStorage.removeItem(GUEST_TOKEN_KEY);
  localStorage.removeItem(DEMO_KEY);
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  window.location.assign(`${window.location.origin}${base}/sign-in`);
}

/** Same as exitDemoToSignIn but for the sign-up route. */
export function exitDemoToSignUp(): void {
  disableDemoMode();
  clearAppSession();
  localStorage.removeItem(GUEST_TOKEN_KEY);
  localStorage.removeItem(DEMO_KEY);
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  window.location.assign(`${window.location.origin}${base}/sign-up`);
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
