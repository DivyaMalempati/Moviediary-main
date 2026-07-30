import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { getAuth } from "@clerk/express";

const router = Router();

const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const GUEST_PREFIX = "guest_";

/** Sign an opaque id → "id.hmac_hex" */
function signId(id: string): string {
  const sig = createHmac("sha256", SECRET).update(id).digest("hex");
  return `${id}.${sig}`;
}

function verifySignedId(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!id || !sig) return null;

  const expected = createHmac("sha256", SECRET).update(id).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return id;
}

/**
 * Verify a guest token and return the full userId ("guest_<uuid>"),
 * or null if the signature is invalid or malformed.
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
router.post("/guest-session", (_req, res) => {
  const id = randomUUID();
  const token = signId(id);
  res.json({ token, userId: GUEST_PREFIX + id });
});

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
