import { useMemo } from "react";
import { Layout } from "@/components/layout";
import { useGetMovieStats } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Area, AreaChart,
} from "recharts";
import { Loader2, TrendingUp, Star, Globe, Film, Award, CalendarDays } from "lucide-react";
import { RATING_LABELS } from "@/lib/movie-utils";

// ── Constants ────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  te: "Telugu", ta: "Tamil", ml: "Malayalam", kn: "Kannada",
  hi: "Hindi", en: "English", ko: "Korean", ja: "Japanese",
  fr: "French", es: "Spanish", it: "Italian", de: "German", zh: "Chinese",
  bn: "Bengali", mr: "Marathi", gu: "Gujarati", pa: "Punjabi",
};

const RATING_ORDER = ["loved", "great", "very_good", "good", "ok", "avg", "meh"];

const CHART_COLORS = [
  "#ffffff", "#e0e0e0", "#b0b0b0", "#888888", "#666666", "#444444", "#333333",
];

const GENRE_PALETTE = [
  "#f0f0f0", "#d4d4d4", "#b8b8b8", "#9c9c9c", "#808080",
  "#6b6b6b", "#555555", "#404040", "#2e2e2e",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex gap-4 items-start">
      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold mt-0.5 leading-none truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
      {children}
    </h2>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-muted-foreground mt-0.5">
          {p.value} {p.value === 1 ? "film" : "films"}
        </p>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Film className="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
      <p className="text-lg font-medium">No data yet</p>
      <p className="text-sm text-muted-foreground mt-1">Add some watched films to see your stats.</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const { data: stats, isLoading } = useGetMovieStats();

  // Sort ratings in defined order
  const ratingData = useMemo(() => {
    if (!stats?.byRating) return [];
    return RATING_ORDER
      .map((key) => {
        const found = stats.byRating.find((r) => r.key === key);
        return found ? { key: RATING_LABELS[key] ?? key, count: found.count } : null;
      })
      .filter(Boolean) as { key: string; count: number }[];
  }, [stats?.byRating]);

  const topGenres = useMemo(() => (stats?.byGenre ?? []).slice(0, 10), [stats?.byGenre]);

  const topLanguages = useMemo(() => (stats?.byLanguage ?? []).slice(0, 8), [stats?.byLanguage]);

  const monthlyData = useMemo(() => {
    if (!stats?.byMonth || stats.byMonth.length === 0) return [];
    return stats.byMonth.map((m) => ({
      month: formatMonth(m.key),
      count: m.count,
    }));
  }, [stats?.byMonth]);

  // ── Milestones ────────────────────────────────────────────────────────────

  const mostWatchedGenre = stats?.byGenre?.[0]?.key ?? null;
  const topLanguage = stats?.byLanguage?.[0];
  const topLanguageName = topLanguage ? (LANG_NAMES[topLanguage.key] ?? topLanguage.key.toUpperCase()) : null;
  const bestMonth = useMemo(() => {
    if (!stats?.byMonth || stats.byMonth.length === 0) return null;
    const best = [...stats.byMonth].sort((a, b) => b.count - a.count)[0];
    return { label: formatMonth(best.key), count: best.count };
  }, [stats?.byMonth]);

  const topRating = useMemo(() => {
    if (!stats?.byRating || stats.byRating.length === 0) return null;
    // Most common rating
    const sorted = [...stats.byRating].sort((a, b) => b.count - a.count);
    return sorted[0];
  }, [stats?.byRating]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const hasData = (stats?.totalWatched ?? 0) > 0;

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Your Taste in Numbers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            A look at how your cinema journey has unfolded
          </p>
        </div>

        {!hasData ? <EmptyState /> : (
          <>
            {/* Milestone cards */}
            <section>
              <SectionTitle>Highlights</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  icon={Film}
                  label="Films watched"
                  value={stats!.totalWatched}
                  sub={stats!.totalWatchlist > 0 ? `${stats!.totalWatchlist} on watchlist` : undefined}
                />
                {mostWatchedGenre && (
                  <StatCard
                    icon={Award}
                    label="Favourite genre"
                    value={mostWatchedGenre}
                    sub={`${stats!.byGenre[0].count} films`}
                  />
                )}
                {topLanguageName && (
                  <StatCard
                    icon={Globe}
                    label="Top language"
                    value={topLanguageName}
                    sub={`${topLanguage!.count} films`}
                  />
                )}
                {bestMonth && (
                  <StatCard
                    icon={CalendarDays}
                    label="Most active month"
                    value={bestMonth.label}
                    sub={`${bestMonth.count} films`}
                  />
                )}
              </div>
            </section>

            {/* Films per month */}
            {monthlyData.length > 0 && (
              <section>
                <SectionTitle>Films watched over time</SectionTitle>
                <div className="rounded-xl border border-border bg-card p-5">
                  {monthlyData.length === 1 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Keep watching — your timeline will grow here.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: "#888" }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#888" }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#ffffff"
                          strokeWidth={2}
                          fill="url(#monthGrad)"
                          dot={false}
                          activeDot={{ r: 4, fill: "#fff", stroke: "#333" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>
            )}

            {/* Ratings + Languages side by side */}
            <div className="grid md:grid-cols-2 gap-6">

              {/* Ratings distribution */}
              {ratingData.length > 0 && (
                <section>
                  <SectionTitle>Ratings breakdown</SectionTitle>
                  <div className="rounded-xl border border-border bg-card p-5">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={ratingData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="key"
                          type="category"
                          width={72}
                          tick={{ fontSize: 11, fill: "#888" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {ratingData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {/* Languages */}
              {topLanguages.length > 0 && (
                <section>
                  <SectionTitle>Languages</SectionTitle>
                  <div className="rounded-xl border border-border bg-card p-5">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={topLanguages.map((l) => ({
                          key: LANG_NAMES[l.key] ?? l.key.toUpperCase(),
                          count: l.count,
                        }))}
                        layout="vertical"
                        margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="key"
                          type="category"
                          width={72}
                          tick={{ fontSize: 11, fill: "#888" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {topLanguages.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}
            </div>

            {/* Genres */}
            {topGenres.length > 0 && (
              <section>
                <SectionTitle>Top genres</SectionTitle>
                <div className="rounded-xl border border-border bg-card p-5">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={topGenres} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="key"
                        tick={{ fontSize: 11, fill: "#888" }}
                        axisLine={false}
                        tickLine={false}
                        angle={-35}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#888" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {topGenres.map((_, i) => (
                          <Cell key={i} fill={GENRE_PALETTE[i % GENRE_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
