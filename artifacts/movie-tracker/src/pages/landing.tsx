import { Clapperboard, Film, Sparkles, Star, Shuffle, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { clearAppSession, disableDemoMode, enableDemoMode } from "@/lib/demo-auth";

function clearGuestBeforeAuth() {
  disableDemoMode();
  clearAppSession();
}

export default function LandingPage() {
  const enterApp = async (path = "/watched") => {
    try {
      await enableDemoMode();
    } catch {
      // If session creation fails, fall back gracefully
    }
    window.location.href =
      (import.meta.env.BASE_URL || "/").replace(/\/$/, "") + path;
  };

  const handleDemo = async () => {
    await enterApp("/watched");
  };

  const handleTogether = async () => {
    await enterApp("/partner");
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold text-xl tracking-tight">Cinevault</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/sign-in" onClick={clearGuestBeforeAuth}>
              Sign in
            </Link>
          </Button>
          <Button size="sm" className="bg-white text-black hover:bg-white/90" asChild>
            <Link href="/sign-up" onClick={clearGuestBeforeAuth}>
              Get started
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-8">
          <Clapperboard className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-2xl leading-tight mb-6">
          Your personal<br />
          <span className="text-white/50">world cinema</span> vault
        </h1>

        <p className="text-muted-foreground text-lg max-w-md mb-10 leading-relaxed">
          Track every film you've watched. Build your watchlist. Get AI-powered suggestions tuned to the cinema you actually love.
        </p>

        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <Button
            size="lg"
            className="bg-white text-black hover:bg-white/90 w-full text-base h-12"
            asChild
          >
            <Link href="/sign-up" onClick={clearGuestBeforeAuth}>
              Get started
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full text-base h-12 bg-transparent"
            asChild
          >
            <Link href="/sign-in" onClick={clearGuestBeforeAuth}>
              Sign in
            </Link>
          </Button>

          <div className="flex items-center gap-3 w-full mt-1">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <Button
            size="lg"
            variant="ghost"
            className="w-full text-base h-12 text-muted-foreground hover:text-foreground border border-border/50"
            onClick={handleDemo}
          >
            Continue without signing in
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full text-base h-11 text-foreground border border-white/20 hover:bg-white/5"
            onClick={handleTogether}
          >
            <Users className="w-4 h-4 mr-2" />
            Open Together
          </Button>
          <p className="text-[11px] text-muted-foreground/60 -mt-1">
            Data is saved on this device
          </p>
        </div>
      </main>

      {/* Features — MVP only */}
      <section className="border-t border-border/40 px-6 py-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-center">
          {[
            { icon: Film, title: "Watched & Watchlist", desc: "Log films you’ve seen and save titles for later" },
            { icon: Shuffle, title: "Swipe", desc: "Short solo decks mixed for your genres and languages" },
            { icon: Users, title: "Together", desc: "Invite a friend, swipe the same deck, pick from mutual likes" },
            { icon: Star, title: "Rate your way", desc: "Loved to Meh — quick ratings when you mark something watched" },
            { icon: Clapperboard, title: "Add films", desc: "Search TMDB and drop titles straight into your vault" },
            { icon: Sparkles, title: "Your taste", desc: "Preferences shape Swipe and movie-night decks — each person sets their own" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-sm">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[16rem]">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
