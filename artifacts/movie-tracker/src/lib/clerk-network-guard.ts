/**
 * Clerk FAPI / token refresh can reject with "Network error … Load failed"
 * on flaky Replit preview networks. Those rejections are not actionable for
 * local features (share poster, save image) and must not surface as fatal UI.
 *
 * Call once at startup (before React mount). Pair with the Vite runtime-error
 * overlay filter so Replit's error modal stays dismissed for the same cases.
 */
export function installClerkNetworkGuard(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __cinevaultClerkGuard?: boolean };
  if (w.__cinevaultClerkGuard) return;
  w.__cinevaultClerkGuard = true;

  const isBenignClerkNetwork = (reason: unknown): boolean => {
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : String(reason ?? "");
    if (/ClerkJS:\s*Network error/i.test(msg)) return true;
    if (
      /clerk\.accounts\.dev/i.test(msg) &&
      /Load failed|Failed to fetch|NetworkError|network error/i.test(msg)
    ) {
      return true;
    }
    return false;
  };

  window.addEventListener("unhandledrejection", (event) => {
    if (isBenignClerkNetwork(event.reason)) {
      event.preventDefault();
    }
  });
}
