import { cn } from "@/lib/utils";
import { useGenreList } from "@/lib/genres";
import { FEATURED_PROVIDER_IDS, useWatchProviderCatalog } from "@/lib/preferences";

// ── Language catalogue ────────────────────────────────────────────────────
export const LANGUAGE_GROUPS = [
  {
    label: "South Asian",
    langs: [
      { code: "hi", name: "Hindi" },
      { code: "te", name: "Telugu" },
      { code: "ta", name: "Tamil" },
      { code: "ml", name: "Malayalam" },
      { code: "kn", name: "Kannada" },
      { code: "bn", name: "Bengali" },
      { code: "mr", name: "Marathi" },
      { code: "gu", name: "Gujarati" },
      { code: "pa", name: "Punjabi" },
    ],
  },
  {
    label: "East Asian",
    langs: [
      { code: "ko", name: "Korean" },
      { code: "ja", name: "Japanese" },
      { code: "zh", name: "Chinese" },
    ],
  },
  {
    label: "Southeast Asian",
    langs: [
      { code: "th", name: "Thai" },
      { code: "id", name: "Indonesian" },
      { code: "tl", name: "Filipino" },
      { code: "vi", name: "Vietnamese" },
    ],
  },
  {
    label: "Western",
    langs: [
      { code: "en", name: "English" },
      { code: "es", name: "Spanish" },
      { code: "fr", name: "French" },
      { code: "de", name: "German" },
      { code: "it", name: "Italian" },
      { code: "pt", name: "Portuguese" },
    ],
  },
  {
    label: "Middle Eastern & Other",
    langs: [
      { code: "ar", name: "Arabic" },
      { code: "fa", name: "Persian" },
      { code: "tr", name: "Turkish" },
      { code: "he", name: "Hebrew" },
      { code: "ru", name: "Russian" },
    ],
  },
];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function LanguagePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (code: string) => void;
}) {
  return (
    <div className="space-y-6">
      {LANGUAGE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.langs.map(({ code, name }) => (
              <Pill key={code} active={selected.includes(code)} onClick={() => onToggle(code)}>
                {name}
              </Pill>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GenrePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const { data: genres, isLoading, isError, refetch } = useGenreList();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading genres…</p>;
  }

  if (isError || !genres?.length) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>Couldn't load genres.</span>
        <button
          onClick={() => refetch()}
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {genres.map(({ id, name }) => (
        <Pill key={id} active={selected.includes(name)} onClick={() => onToggle(name)}>
          {name}
        </Pill>
      ))}
    </div>
  );
}

export function ProviderPicker({
  selected,
  onToggle,
  watchRegion = "IN",
}: {
  selected: number[];
  onToggle: (providerId: number) => void;
  watchRegion?: string;
}) {
  const { data: catalog, isLoading, isError, refetch } = useWatchProviderCatalog(watchRegion);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading streaming services…</p>;
  }

  const list = catalog?.length ? catalog : [];

  if (isError && !list.length) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>Couldn&apos;t load streaming services.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const featured = FEATURED_PROVIDER_IDS.map((id) => list.find((p) => p.providerId === id)).filter(
    Boolean,
  ) as typeof list;
  const featuredIds = new Set(featured.map((p) => p.providerId));
  // If TMDB renamed apps (e.g. Hotstar → JioHotstar), still show a useful set.
  const topByPriority = list
    .filter((p) => !featuredIds.has(p.providerId))
    .slice(0, featured.length >= 4 ? 0 : 8);
  const selectedExtra = list.filter(
    (p) => selected.includes(p.providerId) && !featuredIds.has(p.providerId),
  );
  const shownIds = new Set<number>();
  const shown = [...featured, ...topByPriority, ...selectedExtra].filter((p) => {
    if (shownIds.has(p.providerId)) return false;
    shownIds.add(p.providerId);
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {shown.map((p) => (
          <Pill
            key={p.providerId}
            active={selected.includes(p.providerId)}
            onClick={() => onToggle(p.providerId)}
          >
            {p.name}
          </Pill>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Region: {watchRegion}. Used by Search and Swipe when “Available on my streaming services” is
        on.
      </p>
    </div>
  );
}

