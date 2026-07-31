import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAuth, useClerk } from "@clerk/react";
import {
  setClerkTokenGetter,
  establishAppSession,
  clearAppSession,
} from "@/lib/demo-auth";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Bridges Clerk session JWTs into API requests (api-client-react + raw fetch).
 * Cookie-based auth fails on proxied preview hosts with
 * X-Clerk-Auth-Reason: dev-browser-missing — Bearer tokens fix that.
 *
 * After the first JWT, exchanges it for a first-party x-cinevault-token so
 * subsequent API calls stay authenticated even if getToken() flakes.
 */
export function ClerkAuthTokenBridge({ children }: { children?: ReactNode }) {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const clerk = useClerk();
  const [phase, setPhase] = useState<"loading" | "ready" | "no-token">("loading");
  const readyOnce = useRef(false);

  useLayoutEffect(() => {
    let cancelled = false;

    async function resolveToken(): Promise<string | null> {
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const token =
            (await getToken({ skipCache: attempt > 0 })) ??
            (await clerk.session?.getToken({ skipCache: attempt > 0 })) ??
            null;
          if (token) return token;
        } catch {
          // Session still hydrating
        }
        await new Promise((r) => setTimeout(r, 50 + attempt * 25));
      }
      return null;
    }

    async function sync() {
      if (!isLoaded) {
        if (!cancelled && !readyOnce.current) setPhase("loading");
        return;
      }

      if (!isSignedIn) {
        setClerkTokenGetter(null);
        clearAppSession();
        readyOnce.current = true;
        if (!cancelled) setPhase("ready");
        return;
      }

      // Keep the app mounted while refreshing tokens — flipping back to
      // "loading" unmounted Swipe and raced preferences into Session expired.
      if (!cancelled && !readyOnce.current) setPhase("loading");

      setClerkTokenGetter(async () => {
        try {
          return (
            (await getToken()) ??
            (await clerk.session?.getToken()) ??
            null
          );
        } catch {
          return null;
        }
      });

      const token = await resolveToken();
      if (cancelled) return;

      if (!token) {
        const existing = localStorage.getItem("cinevault:app-token");
        if (existing) {
          readyOnce.current = true;
          setPhase("ready");
          return;
        }
        setClerkTokenGetter(null);
        setPhase("no-token");
        return;
      }

      let lastToken = token;
      setClerkTokenGetter(async () => {
        try {
          const next =
            (await getToken()) ??
            (await clerk.session?.getToken()) ??
            lastToken;
          if (next) lastToken = next;
          return next;
        } catch {
          return lastToken;
        }
      });

      await establishAppSession(token);
      if (cancelled) return;

      readyOnce.current = true;
      setPhase("ready");
    }

    void sync();
    return () => {
      cancelled = true;
      // Do not clear the token getter here. Effect re-runs (Clerk identity
      // changes) used to null it briefly and preferences/Swipe treated that
      // as "Session expired" while the user was still signed in.
    };
  }, [getToken, isSignedIn, isLoaded, clerk]);

  if (!isLoaded || phase === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (phase === "no-token") {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/";
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground max-w-sm">
          Signed in, but we couldn&apos;t establish an API session on this preview host.
          Refresh the page, or sign out and try again.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
          <Button
            onClick={() => {
              clearAppSession();
              void clerk.signOut({ redirectUrl: `${window.location.origin}${base}` });
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
