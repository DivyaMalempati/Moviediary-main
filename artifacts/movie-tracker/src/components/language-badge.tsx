import { cn } from "@/lib/utils";

interface LanguageBadgeProps {
  language: string | null | undefined;
  className?: string;
}

const LANG_LABELS: Record<string, string> = {
  te: "TE",
  ta: "TA",
  ml: "ML",
  kn: "KN",
  hi: "HI",
  en: "EN",
};

export function LanguageBadge({ language, className }: LanguageBadgeProps) {
  if (!language) return null;

  const code = language.toLowerCase();
  const label = LANG_LABELS[code] ?? language.toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider border shadow-sm backdrop-blur-sm",
        "bg-white/10 text-white border-white/20",
        className
      )}
    >
      {label}
    </span>
  );
}
