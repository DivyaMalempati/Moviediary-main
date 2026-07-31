import { useEffect, useRef } from "react";
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
import StatsPage from "@/pages/stats";
import PartnerPage, { PairInvitePage } from "@/pages/partner";
import MatchSessionPage from "@/pages/match-session";
import GuidePage from "@/pages/guide";
import NotFound from "@/pages/not-found";

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
 * Clerk FAPI proxy — required on Replit production hosts so Google OAuth and
 * session cookies work without a custom CNAME. Dev instances skip the proxy.
 */
function resolveClerkProxyUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (import.meta.env.PROD) return "/api/__clerk";
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
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
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
    fontFamily: "'Outfit', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#111111] rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-bold",
    headerSubtitle: "text-[#888888]",
    socialButtonsBlockButtonText: "text-[#f0f0f0]",
    formFieldLabel: "text-[#aaaaaa]",
    footerActionLink: "text-white hover:text-white/80",
    footerActionText: "text-[#666666]",
    dividerText: "text-[#555555]",
    identityPreviewEditButton: "text-white",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[#f0f0f0]",
    logoBox: "flex justify-center",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10",
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

// ── Shared app pages (used in both demo and Clerk mode) ─────────────────────
function AppPages() {
  return (
    <Switch>
      <Route path="/watched" component={WatchedPage} />
      <Route path="/watchlist" component={WatchlistPage} />
      <Route path="/upcoming" component={UpcomingPage} />
      <Route path="/add" component={AddPage} />
      <Route path="/suggestions" component={SuggestionsPage} />
      <Route path="/swipe" component={SwipePage} />
      <Route path="/partner" component={PartnerPage} />
      <Route path="/pair/:code" component={PairInvitePage} />
      <Route path="/match/:id" component={MatchSessionPage} />
      <Route path="/guide" component={GuidePage} />
      <Route path="/movie/:id" component={MovieDetailsPage} />
      <Route path="/import" component={ImportPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/collections" component={CollectionsPage} />
      <Route path="/collections/:id" component={CollectionsPage} />
      <Route path="/stats" component={StatsPage} />
      <Route component={NotFound} />
    </Switch>
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
      <Route path="/" component={() => <Redirect to="/watched" />} />
      <Route path="/sign-in" component={() => <Redirect to="/watched" />} />
      <Route path="/sign-up" component={() => <Redirect to="/watched" />} />
      <Route path="/onboarding" component={() => <Redirect to="/swipe" />} />
      <AppPages />
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

function SignInPage() {
  // Visiting sign-in must leave demo/guest mode or Google OAuth stays wedged.
  useEffect(() => {
    if (isDemoMode()) disableDemoMode();
    clearAppSession();
  }, []);

  const afterAuth = absoluteAppUrl("/watched");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={afterAuth}
        fallbackRedirectUrl={afterAuth}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function SignUpPage() {
  useEffect(() => {
    if (isDemoMode()) disableDemoMode();
    clearAppSession();
  }, []);

  const afterAuth = absoluteAppUrl("/watched");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={afterAuth}
        fallbackRedirectUrl={afterAuth}
        appearance={clerkAppearance}
      />
    </div>
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

function ClerkRouter() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/onboarding" component={() => <Redirect to="/swipe" />} />
      <Route path="/watched" component={() => <ProtectedRoute component={WatchedPage} />} />
      <Route path="/watchlist" component={() => <ProtectedRoute component={WatchlistPage} />} />
      <Route path="/upcoming" component={() => <ProtectedRoute component={UpcomingPage} />} />
      <Route path="/add" component={() => <ProtectedRoute component={AddPage} />} />
      <Route path="/suggestions" component={() => <ProtectedRoute component={SuggestionsPage} />} />
      <Route path="/swipe" component={() => <ProtectedRoute component={SwipePage} />} />
      <Route path="/partner" component={() => <ProtectedRoute component={PartnerPage} />} />
      <Route path="/pair/:code" component={() => <ProtectedRoute component={PairInvitePage} />} />
      <Route path="/match/:id" component={() => <ProtectedRoute component={MatchSessionPage} />} />
      <Route path="/guide" component={() => <ProtectedRoute component={GuidePage} />} />
      <Route path="/movie/:id" component={() => <ProtectedRoute component={MovieDetailsPage} />} />
      <Route path="/import" component={() => <ProtectedRoute component={ImportPage} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} />} />
      <Route path="/collections" component={() => <ProtectedRoute component={CollectionsPage} />} />
      <Route path="/collections/:id" component={() => <ProtectedRoute component={CollectionsPage} />} />
      <Route path="/stats" component={() => <ProtectedRoute component={StatsPage} />} />
      <Route component={NotFound} />
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
          <ClerkRouter />
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
          <DemoRouter />
          <Toaster />
        </QueryClientProvider>
      )}
    </WouterRouter>
  );
}

export default App;

export { basePath, disableDemoMode };
