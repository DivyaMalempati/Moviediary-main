import { getAuth } from "@clerk/express";
import { verifyGuestToken } from "../routes/guest.js";

/**
 * Express middleware that requires an authenticated user.
 *
 * Accepts (in priority order):
 *   1. x-guest-token header — HMAC-signed guest token issued by POST /guest-session.
 *      Sets req.userId = "guest_<uuid>". Works in all environments.
 *   2. Clerk session cookie / Authorization header.
 */
export function requireAuth(req: any, res: any, next: any) {
  // 1. Guest session via signed token
  const guestToken = req.headers["x-guest-token"];
  if (typeof guestToken === "string" && guestToken) {
    const userId = verifyGuestToken(guestToken);
    if (userId) {
      req.userId = userId;
      next();
      return;
    }
    // Token present but invalid — reject early rather than falling through to Clerk
    res.status(401).json({ error: "Invalid guest token" });
    return;
  }

  // 2. Clerk (only when clerkMiddleware is mounted)
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
