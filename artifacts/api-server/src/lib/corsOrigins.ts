/**
 * CORS origin allowlist for credentialed API requests.
 *
 * Configure extras with CORS_ORIGINS (comma-separated) and/or APP_ORIGIN /
 * FRONTEND_ORIGIN. Replit preview/publish hosts are always allowed.
 */

function configuredOrigins(): string[] {
  const fromList = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const singles = [process.env.APP_ORIGIN, process.env.FRONTEND_ORIGIN, process.env.FRONTEND_DEV_URL]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  return [...new Set([...fromList, ...singles])];
}

function isReplitHost(hostname: string): boolean {
  return (
    hostname.endsWith(".replit.dev") ||
    hostname.endsWith(".replit.app") ||
    hostname.endsWith(".kirk.replit.dev")
  );
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Whether a browser Origin header may access the API with credentials. */
export function isOriginAllowed(origin: string | undefined): boolean {
  // Non-browser / same-origin clients omit Origin.
  if (!origin) return true;

  if (configuredOrigins().includes(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    if (isLocalHost(hostname)) return true;
    if (isReplitHost(hostname)) return true;
  } catch {
    return false;
  }

  // Outside production, allow unknown origins for local tooling.
  if (process.env.NODE_ENV !== "production") return true;

  return false;
}
