import { getAuth } from "@clerk/express";
import { verifyGuestToken, verifyAppSessionToken } from "../routes/guest.js";

/**
 * Express middleware that requires an authenticated user.
 *
 * Accepts (in priority order):
 *   1. x-guest-token — HMAC guest session from POST /guest-session
 *   2. x-cinevault-token — HMAC app session from POST /clerk-session
 *      (minted after a one-time Clerk Bearer exchange; works when Clerk
 *      cookies fail with X-Clerk-Auth-Reason: dev-browser-missing)
 *   3. Clerk session cookie / Authorization Bearer header
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

  // 2. First-party app session (Clerk exchange)
  const appToken = req.headers["x-cinevault-token"];
  if (typeof appToken === "string" && appToken) {
    const userId = verifyAppSessionToken(appToken);
    if (userId) {
      req.userId = userId;
      next();
      return;
    }
    res.status(401).json({ error: "Invalid session token" });
    return;
  }

  // 3. Clerk (only when clerkMiddleware is mounted)
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
