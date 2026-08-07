const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Origin of the site the user actually opened (address bar / outermost frame).
 * Prefer ancestorOrigins when embedded so Together links don't stick to a
 * nested *.replit.app iframe host.
 */
export function getPublicOrigin(): string {
  if (typeof window === "undefined") return "";

  try {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      const outer = ancestors[ancestors.length - 1];
      if (outer) return new URL(outer).origin;
    }
  } catch {
    /* ignore */
  }

  try {
    if (window.top && window.top !== window.self) {
      return window.top.location.origin;
    }
  } catch {
    /* cross-origin parent — fall through */
  }

  return window.location.origin;
}

/**
 * Absolute URL for invite / match / share links on the current host.
 * Path-only API values (e.g. `/pair/reel-…`) are fine; absolute URLs are
 * rewritten onto the current origin so an old Replit host never leaks through.
 */
export function absoluteAppUrl(pathOrUrl: string): string {
  let pathname = (pathOrUrl || "").trim();
  if (!pathname) {
    return `${getPublicOrigin()}${BASE && BASE !== "/" ? BASE : ""}` || getPublicOrigin();
  }

  try {
    if (/^https?:\/\//i.test(pathname)) {
      const u = new URL(pathname);
      pathname = `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* keep raw path */
  }

  if (!pathname.startsWith("/")) pathname = `/${pathname}`;

  const prefix = BASE && BASE !== "/" ? BASE : "";
  if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return `${getPublicOrigin()}${pathname}`;
  }
  return `${getPublicOrigin()}${prefix}${pathname}`;
}
