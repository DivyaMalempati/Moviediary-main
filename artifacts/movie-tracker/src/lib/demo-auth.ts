import { setExtraHeaders, clearExtraHeaders } from "@workspace/api-client-react";

const DEMO_KEY        = "cinevault:demo";
const GUEST_TOKEN_KEY = "cinevault:guest-token";
const BASE            = import.meta.env.BASE_URL.replace(/\/$/, "");

export function isDemoMode(): boolean {
  return localStorage.getItem(DEMO_KEY) === "1";
}

/**
 * Returns the x-guest-token header for raw fetch() calls.
 * Returns {} for signed-in Clerk users (token is not stored).
 */
export function getGuestHeaders(): Record<string, string> {
  const token = localStorage.getItem(GUEST_TOKEN_KEY);
  return token ? { "x-guest-token": token } : {};
}

async function mintGuestToken(): Promise<string> {
  const res = await fetch(`${BASE}/api/guest-session`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create guest session");
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem(DEMO_KEY, "1");
  localStorage.setItem(GUEST_TOKEN_KEY, token);
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
}

/** Call once on app startup to restore an existing guest session from localStorage. */
export function initDemoMode(): void {
  if (isDemoMode()) {
    const token = localStorage.getItem(GUEST_TOKEN_KEY);
    if (token) setExtraHeaders({ "x-guest-token": token });
  }
}
