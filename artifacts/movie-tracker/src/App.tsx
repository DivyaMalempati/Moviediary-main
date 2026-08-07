import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/sonner";
import { ClerkAuthTokenBridge } from "@/components/clerk-auth-token-bridge";
import { isDemoMode, initDemoMode, disableDemoMode, enableDemoMode, clearAppSession } from "@/lib/demo-auth";
// disableDemoMode used when Clerk session appears / leaving guest mode

import LandingPage from "@/pages/landing";
import WatchedPage from "@/pages/watched";
import WatchlistPage from "@/pages/watchlist";
import UpcomingPage from "@/pages/upcoming";
import AddPage from "@/pages/add";
import SuggestionsPage from "@/pages/suggestions";
import SwipePage from "@/pages/swipe";
import MovieDetailsPage from "@/pages/movie-details";
import ImportPage from "@/pages/import";
import ProfilePage from "@/pages/profile";
import CollectionsPage from "@/pages/collections";
import SharedCollectionPage from "@/pages/shared-collection";
import StatsPage from "@/pages/stats";
import PartnerPage, { PairInvitePage } from "@/pages/partner";
import MatchSessionPage from "@/pages/match-session";
import GuidePage from "@/pages/guide";
import NotFound from "@/pages/not-found";
import { FeatureGate } from "@/components/feature-gate";
import { FeatureTourProvider } from "@/components/feature-tour-context";
import { FeatureWalkthroughHost } from "@/components/feature-walkthrough";
import { FeatureFeedbackPrompt } from "@/components/feature-feedback-prompt";
import { Layout } from "@/components/layout";

// Initialise demo mode header injection before any render
initDemoMode();

const clerkEnvKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkPubKey = clerkEnvKey
  ? publishableKeyFromHost(window.location.hostname, clerkEnvKey) || clerkEnvKey
  : undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Absolute app URL helper (needed for OAuth return on Replit gateway hosts). */
function absoluteAppUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${basePath}${normalized === "/" ? "" : normalized}` || window.location.origin;
}

/**
 * Clerk FAPI proxy — only for production Clerk instances (pk_live_).
 * Development keys (pk_test_) must talk to Clerk directly; forcing /api/__clerk
 * blanks Sign-in / Get started on Replit and other preview hosts.
 * Opt in explicitly with VITE_CLERK_PROXY_URL when the host is registered
 * as a Clerk proxy URL.
 */
function resolveClerkProxyUrl(): string | undefined {
  const fromEnv = (import.meta.env.VITE_CLERK_PROXY_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  const key = clerkEnvKey ?? "";
  if (import.meta.env.PROD && key.includes("pk_live_")) return "/api/__clerk";
  return undefined;
}

const clerkProxyUrl = resolveClerkProxyUrl();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey && !isDemoMode() && import.meta.env.PROD) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  layout: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    /** Hide the orange "Development mode" footer on Clerk components (dev instance keys). */
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: "#ffffff",
    colorForeground: "#f0f0f0",
    colorMutedForeground: "#888888",
    colorDanger: "#ff4444",
    colorBackground: "#0d0d0d",
    colorInput: "#1a1a1a",
    colorInputForeground: "#f0f0f0",
    colorNeutral: "#333333",
    colorText: "#f0f0f0",
    colorTextSecondary: "#888888",
    fontFamily: "'Outfit', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center px-4",
    cardBox:
      "bg-[#111111] rounded-2xl w-full max-w-[min(100%,440px)] overflow-hidden border border-white/10 mx-auto",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-bold",
    headerSubtitle: "text-[#888888]",
    socialButtonsBlockButtonText: { color: "#111111", fontWeight: "500" },
    formFieldLabel: "text-[#aaaaaa]",
    footerActionLink: "text-white hover:text-white/80",
    footerActionText: "text-[#666666]",
    dividerText: "text-[#555555]",
    identityPreviewEditButton: "text-white",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[#f0f0f0]",
    logoBox: "flex justify-center",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: { backgroundColor: "#ffffff", borderColor: "rgba(255,255,255,0.2)" },
    formButtonPrimary: "bg-white text-black hover:bg-white/90",
    formFieldInput: "bg-[#1a1a1a] border-white/20 text-white",
    footerAction: "bg-transparent",
    dividerLine: "bg-white/10",
    alert: "bg-white/5 border-white/10",
    otpCodeFieldInput: "bg-[#1a1a1a] border-white/20 text-white",
    formFieldRow: "",
    main: "",
  },
};

function gated(feature: Parameters<typeof FeatureGate>[0]["feature"], component: React.ComponentType) {
  return () => <FeatureGate feature={feature} component={component} />;
}

// ── Shared app pages (used in both demo and Clerk mode) ─────────────────────
// Persistent Layout stays mounted across in-app navigations (catch-all shell).
function AppPages() {
  return (
    <Layout>
      <Switch>
        <Route path="/watched" component={WatchedPage} />
        <Route path="/watchlist" component={WatchlistPage} />
        <Route path="/upcoming" component={gated("upcoming", UpcomingPage)} />
        <Route path="/add" component={AddPage} />
        <Route path="/suggestions" component={gated("discover", SuggestionsPage)} />
        <Route path="/swipe" component={SwipePage} />
        <Route path="/partner" component={PartnerPage} />
        <Route path="/pair/:code" component={PairInvitePage} />
        <Route path="/match/:id" component={MatchSessionPage} />
        <Route path="/guide" component={GuidePage} />
        <Route path="/movie/:id" component={MovieDetailsPage} />
        <Route path="/import" component={gated("import", ImportPage)} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/collections" component={gated("collections", CollectionsPage)} />
        <Route path="/collections/:id" component={gated("collections", CollectionsPage)} />
        <Route path="/stats" component={gated("stats", StatsPage)} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthUnavailablePage({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <h1 className="text-lg font-semibold">
        {mode === "sign-in" ? "Sign in unavailable" : "Sign up unavailable"}
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        Clerk isn&apos;t configured in this environment, so Google sign-in can&apos;t load.
        Continue without signing in, or set{" "}
        <code className="text-foreground">VITE_CLERK_PUBLISHABLE_KEY</code>.
      </p>
      <a href={`${basePath || ""}/`} className="text-sm underline text-foreground">
        Back to home
      </a>
    </div>
  );
}

// ── Demo mode — no Clerk, fixed userId on backend ───────────────────────────
function DemoRouter() {
  useEffect(() => {
    if (!isDemoMode()) {
      void enableDemoMode().catch(() => {
        // Guest session may fail before API is up; retries happen on next load
      });
    }
  }, []);

  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/c/:token" component={SharedCollectionPage} />
      <Route path="/sign-in/*?" component={() => <AuthUnavailablePage mode="sign-in" />} />
      <Route path="/sign-up/*?" component={() => <AuthUnavailablePage mode="sign-up" />} />
      <Route path="/onboarding" component={() => <Redirect to="/swipe" />} />
      {/* Catch-all keeps Layout mounted across in-app navigations */}
      <Route component={AppPages} />
    </Switch>
  );
}

// ── Clerk mode ───────────────────────────────────────────────────────────────
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      // Signed-in Clerk session must never keep sending a demo guest token.
      if (userId) {
        disableDemoMode();
      } else {
        clearAppSession();
      }
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AuthPageShell({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "sign-in" | "sign-up";
}) {
  const [showHelp, setShowHelp] = useState(false);

  // Visiting auth must leave demo/guest mode or Google OAuth stays wedged.
  useEffect(() => {
    if (isDemoMode()) disableDemoMode();
    clearAppSession();
    const t = window.setTimeout(() => setShowHelp(true), 8000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4">
      {children}
      {showHelp && (
        <div className="max-w-sm text-center space-y-2 text-sm text-muted-foreground">
          <p>
            {mode === "sign-in" ? "Sign in" : "Sign up"} is taking longer than usual.
            Check your connection, then try again.
          </p>
          <a href={absoluteAppUrl("/")} className="underline text-foreground">
            Back to home
          </a>
        </div>
      )}
    </div>
  );
}

function SignInPage() {
  const afterAuth = absoluteAppUrl("/watched");

  return (
    <AuthPageShell mode="sign-in">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={afterAuth}
        fallbackRedirectUrl={afterAuth}
        appearance={clerkAppearance}
      />
    </AuthPageShell>
  );
}

function SignUpPage() {
  const afterAuth = absoluteAppUrl("/watched");

  return (
    <AuthPageShell mode="sign-up">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={afterAuth}
        fallbackRedirectUrl={afterAuth}
        appearance={clerkAppearance}
      />
    </AuthPageShell>
  );
}

function HomeRedirect() {
  if (isDemoMode()) {
    return <SignedInHomeRedirect />;
  }
  return (
    <>
      <Show when="signed-in"><SignedInHomeRedirect /></Show>
      <Show when="signed-out"><LandingPage /></Show>
    </>
  );
}

function SignedInHomeRedirect() {
  try {
    const ret = sessionStorage.getItem("cinevault:return-to");
    if (ret && ret.startsWith("/")) {
      sessionStorage.removeItem("cinevault:return-to");
      return <Redirect to={ret} />;
    }
  } catch {
    /* ignore */
  }
  return <Redirect to="/watched" />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [loc] = useLocation();
  // Demo guest sessions can use the app without a Clerk login.
  // Never force demo here — that trapped Gmail users out of Clerk.
  if (isDemoMode()) {
    return <Component />;
  }
  return (
    <>
      <Show when="signed-in"><Component /></Show>
      <Show when="signed-out">
        <SaveReturnAndRedirect path={loc} />
      </Show>
    </>
  );
}

function SaveReturnAndRedirect({ path }: { path: string }) {
  useEffect(() => {
    try {
      if (path && path !== "/" && !path.startsWith("/sign-")) {
        sessionStorage.setItem("cinevault:return-to", path);
      }
    } catch {
      /* ignore */
    }
  }, [path]);
  return <Redirect to="/" />;
}

function protect(feature: Parameters<typeof FeatureGate>[0]["feature"] | null, component: React.ComponentType) {
  const Page = feature
    ? () => <FeatureGate feature={feature} component={component} />
    : component;
  return () => <ProtectedRoute component={Page} />;
}

function ClerkAppPages() {
  return (
    <Layout>
      <Switch>
        <Route path="/watched" component={protect(null, WatchedPage)} />
        <Route path="/watchlist" component={protect(null, WatchlistPage)} />
        <Route path="/upcoming" component={protect("upcoming", UpcomingPage)} />
        <Route path="/add" component={protect(null, AddPage)} />
        <Route path="/suggestions" component={protect("discover", SuggestionsPage)} />
        <Route path="/swipe" component={protect(null, SwipePage)} />
        <Route path="/partner" component={protect(null, PartnerPage)} />
        <Route path="/pair/:code" component={protect(null, PairInvitePage)} />
        <Route path="/match/:id" component={protect(null, MatchSessionPage)} />
        <Route path="/guide" component={protect(null, GuidePage)} />
        <Route path="/movie/:id" component={protect(null, MovieDetailsPage)} />
        <Route path="/import" component={protect("import", ImportPage)} />
        <Route path="/profile" component={protect(null, ProfilePage)} />
        <Route path="/collections" component={protect("collections", CollectionsPage)} />
        <Route path="/collections/:id" component={protect("collections", CollectionsPage)} />
        <Route path="/stats" component={protect("stats", StatsPage)} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function ClerkRouter() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/c/:token" component={SharedCollectionPage} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/onboarding" component={() => <Redirect to="/swipe" />} />
      {/* Catch-all keeps Layout mounted across in-app navigations */}
      <Route component={ClerkAppPages} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={absoluteAppUrl("/watched")}
      signUpFallbackRedirectUrl={absoluteAppUrl("/watched")}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to your Cinevault" } },
        signUp: { start: { title: "Create your vault", subtitle: "Start tracking Indian cinema" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ClerkAuthTokenBridge>
          <FeatureTourProvider>
            <ClerkRouter />
            <FeatureWalkthroughHost />
            <FeatureFeedbackPrompt />
          </FeatureTourProvider>
        </ClerkAuthTokenBridge>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────
function App() {
  // Always mount Clerk when configured so Gmail sign-in works.
  // Demo mode only affects auth headers / ProtectedRoute — not which router is used.
  const clerkEnabled = Boolean(clerkPubKey);

  return (
    <WouterRouter base={basePath}>
      {clerkEnabled ? (
        <ClerkProviderWithRoutes />
      ) : (
        <QueryClientProvider client={queryClient}>
          <FeatureTourProvider>
            <DemoRouter />
            <FeatureWalkthroughHost />
            <FeatureFeedbackPrompt />
          </FeatureTourProvider>
          <Toaster />
        </QueryClientProvider>
      )}
    </WouterRouter>
  );
}

export default App;

export { basePath, disableDemoMode };
