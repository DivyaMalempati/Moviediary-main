import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { FEATURE_GUIDE_SECTIONS } from "@/lib/feature-guide";
import { useReplayFeatureTour } from "@/components/feature-walkthrough";
import { ArrowRight, BookOpen, Play } from "lucide-react";

export default function GuidePage() {
  const { replay, dialog } = useReplayFeatureTour();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12 space-y-10">
        <header className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5" />
            Feature guide
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            How Cinevault works
          </h1>
          <p className="text-muted-foreground text-base max-w-xl leading-relaxed">
            Track what you’ve watched, swipe short personalized decks, discover
            new titles, and match with a partner when you can’t decide tonight.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-white text-black hover:bg-white/90 gap-2"
              onClick={replay}
            >
              <Play className="w-3.5 h-3.5" />
              Replay walkthrough
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/swipe">Go to Swipe</Link>
            </Button>
          </div>
        </header>

        {FEATURE_GUIDE_SECTIONS.map((section) => (
          <section key={section.heading} className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {section.heading}
            </h2>
            <ul className="space-y-3">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-border/80 bg-secondary/20 px-4 py-4 flex gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <h3 className="font-semibold text-foreground">{item.title}</h3>
                        <p className="text-sm text-foreground/80 mt-0.5">{item.summary}</p>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                          {item.detail}
                        </p>
                      </div>
                      <Link
                        href={item.href}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        {item.cta}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {dialog}
    </Layout>
  );
}
