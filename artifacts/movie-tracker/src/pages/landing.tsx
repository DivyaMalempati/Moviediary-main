import { Link } from "wouter";
import { Clapperboard, Film, Sparkles, Star, Shuffle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enableDemoMode } from "@/lib/demo-auth";

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
          <Link href="/sign-in">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="bg-white text-black hover:bg-white/90">
              Get started
            </Button>
          </Link>
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
          <Link href="/sign-up" className="w-full">
            <Button size="lg" className="bg-white text-black hover:bg-white/90 w-full text-base h-12">
              Get started
            </Button>
          </Link>
          <Link href="/sign-in" className="w-full">
            <Button size="lg" variant="outline" className="w-full text-base h-12 bg-transparent">
              Sign in
            </Button>
          </Link>

          {!import.meta.env.PROD && (
            <>
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
            </>
          )}
        </div>
      </main>

      {/* Features */}
      <section className="border-t border-border/40 px-6 py-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-center">
          {[
            { icon: Film, title: "Full library", desc: "Watched diary, watchlist, ratings, notes, and rewatch history" },
            { icon: Shuffle, title: "Swipe decks", desc: "Short personalized decks with genre, trope, and streaming filters" },
            { icon: Sparkles, title: "Discover", desc: "For You, Because You Liked, and Trending India recommendations" },
            { icon: Users, title: "Movie night", desc: "Share a link, swipe the same deck, and find what you both want tonight" },
            { icon: Star, title: "Rate your way", desc: "Loved to Meh — confirm on tap when you mark something watched" },
            { icon: Clapperboard, title: "Your taste", desc: "Languages, genres, and OTT apps shape every suggestion" },
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
