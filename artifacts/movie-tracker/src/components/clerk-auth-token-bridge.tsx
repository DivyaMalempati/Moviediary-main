import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { setClerkTokenGetter } from "@/lib/demo-auth";

/**
 * Bridges Clerk session JWTs into API requests (api-client-react + raw fetch).
 * Cookie-based auth fails on proxied preview hosts with
 * X-Clerk-Auth-Reason: dev-browser-missing — Bearer tokens fix that.
 */
export function ClerkAuthTokenBridge() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setClerkTokenGetter(null);
      return;
    }

    setClerkTokenGetter(() => getToken());
    return () => setClerkTokenGetter(null);
  }, [getToken, isSignedIn]);

  return null;
}
