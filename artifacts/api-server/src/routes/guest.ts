import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { getAuth } from "@clerk/express";

const router = Router();

const GUEST_PREFIX = "guest_";
/** App / guest session lifetime (30 days). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return "dev-secret-change-me";
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Sign an opaque id → "id.exp.hmac_hex" (exp = unix seconds).
 */
function signId(id: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${id}.${exp}`;
  const sig = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Verify signed session token. Accepts:
 *   - current: id.exp.hmac (rejects when past exp)
 *   - legacy:  id.hmac (no expiry — until clients remint)
 */
function verifySignedId(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");

  if (parts.length === 3) {
    const [id, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!id || !sig || !Number.isFinite(exp)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    const expected = createHmac("sha256", getSessionSecret())
      .update(`${id}.${expStr}`)
      .digest("hex");
    if (!safeEqualHex(sig, expected)) return null;
    return id;
  }

  if (parts.length === 2) {
    const [id, sig] = parts;
    if (!id || !sig) return null;
    const expected = createHmac("sha256", getSessionSecret()).update(id).digest("hex");
    if (!safeEqualHex(sig, expected)) return null;
    return id;
  }

  return null;
}

/**
 * Verify a guest token and return the full userId ("guest_<uuid>"),
 * or null if the signature is invalid, expired, or malformed.
 */
export function verifyGuestToken(token: string): string | null {
  const id = verifySignedId(token);
  if (!id) return null;
  // Guest tokens are only raw UUIDs — never accept clerk user ids here.
  if (id.startsWith("user_") || id.startsWith(GUEST_PREFIX)) return null;
  return GUEST_PREFIX + id;
}

/**
 * Verify an app session token minted after Clerk auth.
 * Returns the Clerk userId (user_…) or null.
 */
export function verifyAppSessionToken(token: string): string | null {
  const id = verifySignedId(token);
  if (!id || !id.startsWith("user_")) return null;
  return id;
}

// POST /guest-session
// Creates a new isolated guest session. No auth required.
// Returns { token } — client stores this and sends it as x-guest-token on every request.
function createGuestSession(_req: unknown, res: import("express").Response) {
  const id = randomUUID();
  const token = signId(id);
  res.json({ token, userId: GUEST_PREFIX + id });
}
router.post("/guest-session", createGuestSession);
// Alias — some clients historically called /api/guest/session
router.post("/guest/session", createGuestSession);

/**
 * POST /clerk-session
 * Exchange a verified Clerk Bearer JWT for a first-party app session token.
 * Used on proxied preview hosts where Clerk cookies aren't available
 * (X-Clerk-Auth-Reason: dev-browser-missing) — client sends Bearer once,
 * then x-cinevault-token on subsequent API calls.
 */
router.post("/clerk-session", (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId || !userId.startsWith("user_")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const token = signId(userId);
    res.json({ token, userId });
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
});

export default router;
