import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const router = Router();

const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const GUEST_PREFIX = "guest_";

/** Sign a guest UUID → "uuid.hmac_hex" */
function signGuestId(id: string): string {
  const sig = createHmac("sha256", SECRET).update(id).digest("hex");
  return `${id}.${sig}`;
}

/**
 * Verify a guest token and return the full userId ("guest_<uuid>"),
 * or null if the signature is invalid or malformed.
 */
export function verifyGuestToken(token: string): string | null {
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
  return GUEST_PREFIX + id;
}

// POST /guest-session
// Creates a new isolated guest session. No auth required.
// Returns { token } — client stores this and sends it as x-guest-token on every request.
router.post("/guest-session", (_req, res) => {
  const id = randomUUID();
  const token = signGuestId(id);
  res.json({ token, userId: GUEST_PREFIX + id });
});

export default router;
