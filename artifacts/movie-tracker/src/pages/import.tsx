import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload, FileText, CheckCircle2, XCircle, AlertCircle,
  Loader2, Download, Copy, RefreshCw, Film,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getListMoviesQueryKey, getGetMovieStatsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/demo-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ────────────────────────────────────────────────────────────────────
interface ImportRow {
  title: string;
  status: string;
  rating?: string;
  year?: number;
  watchedAt?: string;
}

interface ResultRow {
  title: string;
  status: "added" | "updated" | "duplicate" | "not_found" | "error";
  movieTitle?: string;
  tmdbId?: number;
  error?: string;
}

interface ImportResult {
  summary: { added: number; updated: number; duplicates: number; notFound: number; errors: number };
  results: ResultRow[];
}

// ── CSV parser ───────────────────────────────────────────────────────────────

function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; continue; }
    if (line[i] === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
    cur += line[i];
  }
  cols.push(cur.trim());
  return cols;
}

/** Letterboxd exports ratings on a 0.5–5 scale. Map to our 1–10 equivalents. */
function scaleLetterboxdRating(raw: string): string | undefined {
  const n = parseFloat(raw);
  if (isNaN(n)) return undefined;
  // Multiply by 2 so the backend's 1-10 numeric mapper picks the right label
  return String(Math.round(n * 2 * 10) / 10);
}

function isLetterboxdCsv(headerCols: string[]): boolean {
  // Letterboxd diary/ratings exports always have "name" and "letterboxd uri"
  return headerCols.includes("name") && headerCols.includes("letterboxd uri");
}

function parseCSV(text: string, defaultStatus: "watched" | "watchlist" = "watched"): { rows: ImportRow[]; source: "letterboxd" | "cinevault" | "generic" } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], source: "generic" };

  const first = lines[0].toLowerCase();
  const hasHeader =
    first.includes("title") || first.includes("status") ||
    first.includes("rating") || first.includes("name");

  if (hasHeader) {
    const headerCols = splitCSVLine(lines[0]).map((c) => c.toLowerCase().trim());
    const idx = (...names: string[]) => {
      for (const name of names) {
        const i = headerCols.indexOf(name);
        if (i >= 0) return i;
      }
      return -1;
    };

    // ── Letterboxd format ────────────────────────────────────────────────────
    if (isLetterboxdCsv(headerCols)) {
      const nameIdx    = idx("name");
      const yearIdx    = idx("year");
      const ratingIdx  = idx("rating");
      const watchedIdx = idx("watched date", "watch date", "date");

      const rows = lines.slice(1).map((line) => {
        const cols = splitCSVLine(line);
        const title = (nameIdx >= 0 ? cols[nameIdx] : cols[0]) ?? "";
        const yearRaw = (yearIdx >= 0 ? cols[yearIdx] : "") ?? "";
        const year = yearRaw ? parseInt(yearRaw, 10) || undefined : undefined;
        const ratingRaw = (ratingIdx >= 0 ? cols[ratingIdx] : "") ?? "";
        const rating = ratingRaw ? scaleLetterboxdRating(ratingRaw) : undefined;
        const watchedRaw = (watchedIdx >= 0 ? cols[watchedIdx] : "") ?? "";
        const watchedAt = watchedRaw.trim() || undefined;
        return { title, status: "watched" as const, rating, year, watchedAt };
      }).filter((r) => r.title.length > 0);

      return { rows, source: "letterboxd" };
    }

    // ── Cinevault / generic CSV with header ──────────────────────────────────
    const titleIdx   = idx("title", "name");
    const statusIdx  = idx("status");
    const ratingIdx  = idx("rating");
    const yearIdx    = idx("year");
    const watchedIdx = idx("watched_at", "watchedat", "watched date", "watch date", "watched", "date", "watch_date");

    const isCinevault = headerCols.includes("status");

    const rows = lines.slice(1).map((line) => {
      const cols = splitCSVLine(line);
      const title = (titleIdx >= 0 ? cols[titleIdx] : cols[0]) ?? "";
      const statusRaw = (statusIdx >= 0 ? cols[statusIdx] : "") ?? "";
      const status = (["watched", "watchlist"].includes(statusRaw.toLowerCase())
        ? statusRaw.toLowerCase()
        : defaultStatus) as "watched" | "watchlist";
      const ratingRaw = (ratingIdx >= 0 ? cols[ratingIdx] : "") ?? "";
      const rating = ratingRaw || undefined;
      const yearRaw = (yearIdx >= 0 ? cols[yearIdx] : "") ?? "";
      const year = yearRaw ? parseInt(yearRaw, 10) || undefined : undefined;
      const watchedRaw = (watchedIdx >= 0 ? cols[watchedIdx] : "") ?? "";
      const watchedAt = watchedRaw.trim() || undefined;
      return { title, status, rating, year, watchedAt };
    }).filter((r) => r.title.length > 0);

    return { rows, source: isCinevault ? "cinevault" : "generic" };
  }

  // No header — positional fallback
  const rows = lines.map((line) => {
    const cols = splitCSVLine(line);
    const title = cols[0] ?? "";
    const status = (["watched", "watchlist"].includes(cols[1]?.toLowerCase())
      ? cols[1].toLowerCase()
      : defaultStatus) as "watched" | "watchlist";
    const rating = cols[2] || undefined;
    const year = cols[3] ? parseInt(cols[3], 10) || undefined : undefined;
    const watchedAt = cols[4]?.trim() || undefined;
    return { title, status, rating, year, watchedAt };
  }).filter((r) => r.title.length > 0);

  return { rows, source: "generic" };
}

// ── Plain title list ─────────────────────────────────────────────────────────

function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function asStatusHeading(line: string): "watched" | "watchlist" | null {
  const norm = line.replace(/^#+\s*/, "").replace(/:$/, "").trim().toLowerCase();
  if (norm === "watched") return "watched";
  if (norm === "watchlist") return "watchlist";
  return null;
}

function parseTitleList(text: string, defaultStatus: "watched" | "watchlist" = "watched"): ImportRow[] {
  let currentStatus: "watched" | "watchlist" = defaultStatus;
  const results: ImportRow[] = [];
  const isNumbered = /^\s*\d+[.)]\s+\S/.test(text);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = asStatusHeading(stripEmoji(line));
    if (heading) { currentStatus = heading; continue; }
    if (line.startsWith("//")) continue;
    if (isNumbered) {
      const match = line.match(/^\d+[.)]\s+(.+)$/);
      if (!match) continue;
      const title = stripEmoji(match[1]).trim();
      if (title) results.push({ title, status: currentStatus });
    } else {
      const title = stripEmoji(line).trim();
      if (title) results.push({ title, status: currentStatus });
    }
  }
  return results.filter((r) => r.title.length > 0);
}

// ── Parse entry point ─────────────────────────────────────────────────────────

function parseInput(raw: string, defaultStatus: "watched" | "watchlist" = "watched"): { rows: ImportRow[]; source: "letterboxd" | "cinevault" | "generic" | "list" } {
  const hasCsv = raw.includes(",");
  if (hasCsv) return parseCSV(raw, defaultStatus);
  return { rows: parseTitleList(raw, defaultStatus), source: "list" };
}

// ── Template ─────────────────────────────────────────────────────────────────
const TEMPLATE_CSV = `title,status,rating,year,watched_at
"Baahubali 2: The Conclusion",watched,very_good,2017,2017-04-28
"RRR",watched,loved,2022,
"The Dark Knight",watched,loved,2008,2008-07-18
"Parasite",watched,loved,2019,
"My watchlist film",watchlist,,2025,`;

// ── Status display ────────────────────────────────────────────────────────────
const STATUS_ICON: Record<ResultRow["status"], React.ReactNode> = {
  added:     <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />,
  updated:   <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />,
  duplicate: <AlertCircle  className="w-4 h-4 text-yellow-400 flex-shrink-0" />,
  not_found: <XCircle      className="w-4 h-4 text-red-400 flex-shrink-0" />,
  error:     <XCircle      className="w-4 h-4 text-red-400 flex-shrink-0" />,
};

const STATUS_LABEL: Record<ResultRow["status"], string> = {
  added:     "Added",
  updated:   "Rating updated",
  duplicate: "Already in library",
  not_found: "Not found",
  error:     "Error",
};

const CHUNK_SIZE = 25;

// ── Component ────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<{ rows: ImportRow[]; source: string }>({ rows: [], source: "" });
  const [defaultStatus, setDefaultStatus] = useState<"watched" | "watchlist">("watched");
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const parse = useCallback((raw: string, status: "watched" | "watchlist" = "watched") => {
    const parsed = parseInput(raw, status);
    setPreview(parsed);
    return parsed;
  }, []);

  const handleText = (val: string) => {
    setText(val);
    if (val.trim()) parse(val, defaultStatus);
    else setPreview({ rows: [], source: "" });
  };

  const handleDefaultStatus = (val: "watched" | "watchlist") => {
    setDefaultStatus(val);
    if (text.trim()) parse(text, val);
  };

  const handleFile = (file: File) => {
    file.text().then((content) => {
      setText(content);
      parse(content, defaultStatus);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const runImport = async () => {
    const { rows } = parse(text, defaultStatus);
    if (rows.length === 0) {
      toast.error("Nothing to import — paste titles or upload a CSV");
      return;
    }

    setImporting(true);
    setResult(null);
    setProgress({ done: 0, total: rows.length });

    const allResults: ResultRow[] = [];
    const summary = { added: 0, updated: 0, duplicates: 0, notFound: 0, errors: 0 };

    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });

      // Send in chunks so the user sees progress
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const res = await fetch(`${BASE}/api/import`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ rows: chunk }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any).error ?? `HTTP ${res.status}`);
        }

        const data: ImportResult = await res.json();
        allResults.push(...data.results);
        summary.added      += data.summary.added;
        summary.updated    += data.summary.updated ?? 0;
        summary.duplicates += data.summary.duplicates;
        summary.notFound   += data.summary.notFound;
        summary.errors     += data.summary.errors;

        setProgress({ done: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length });
      }

      setResult({ summary, results: allResults });
      qc.invalidateQueries({ queryKey: getListMoviesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetMovieStatsQueryKey() });

      const parts: string[] = [];
      if (summary.added   > 0) parts.push(`${summary.added} added`);
      if (summary.updated > 0) parts.push(`${summary.updated} rating${summary.updated !== 1 ? "s" : ""} updated`);
      if (parts.length > 0) toast.success(parts.join(", "));
      else toast.info("No new movies were added");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cinevault_import_template.csv";
    a.click();
  };

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(TEMPLATE_CSV);
      toast.success("Template copied to clipboard");
    } catch {
      toast.error("Couldn't copy — try downloading the template instead");
    }
  };

  const sourceLabel: Record<string, string> = {
    letterboxd: "Letterboxd export detected ✓",
    cinevault:  "Cinevault export detected ✓",
    generic:    "CSV detected",
    list:       "Title list detected",
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">Import Movies</h1>
        <p className="text-muted-foreground text-sm">
          Paste a list of titles, upload a CSV, or drop your Letterboxd export.
          Each title is matched on TMDB automatically.
        </p>
      </div>

      {/* Format cards */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accepted formats</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">

          {/* Letterboxd */}
          <div className="space-y-1.5">
            <p className="font-medium text-foreground/90 flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-primary" /> Letterboxd
            </p>
            <p className="text-xs text-muted-foreground">
              Export your diary from{" "}
              <span className="font-mono text-[11px]">letterboxd.com → Settings → Import &amp; Export</span>.
              Drop the <span className="font-mono text-[11px]">diary.csv</span> or{" "}
              <span className="font-mono text-[11px]">ratings.csv</span> file here — ratings and dates import automatically.
            </p>
          </div>

          {/* Plain list */}
          <div className="space-y-1.5">
            <p className="font-medium text-foreground/90">Plain list</p>
            <pre className="text-xs text-muted-foreground bg-background/60 rounded-lg p-2.5 font-mono leading-relaxed">
{`Watched
RRR
The Dark Knight

Watchlist
Dune Part Two`}
            </pre>
            <p className="text-xs text-muted-foreground">Heading sets destination. No heading = uses the default above.</p>
          </div>

          {/* CSV */}
          <div className="space-y-1.5">
            <p className="font-medium text-foreground/90">CSV with metadata</p>
            <pre className="text-xs text-muted-foreground bg-background/60 rounded-lg p-2.5 font-mono leading-relaxed">
{`title,status,rating,year
"RRR",watched,loved,2022
"Dune",watchlist,,2021`}
            </pre>
            <p className="text-xs text-muted-foreground">
              Ratings: loved · great · very_good · good · ok · avg · meh
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 text-xs h-7">
            <Download className="w-3 h-3" /> Download template
          </Button>
          <Button variant="outline" size="sm" onClick={copyTemplate} className="gap-1.5 text-xs h-7">
            <Copy className="w-3 h-3" /> Copy template
          </Button>
        </div>
      </div>

      {/* Default status toggle — only shown for non-Letterboxd sources */}
      {(preview.source !== "letterboxd") && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground shrink-0">Import as</span>
          <div className="inline-flex rounded-full border border-border bg-secondary/40 p-0.5">
            {(["watched", "watchlist"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleDefaultStatus(s)}
                className={cn(
                  "px-4 py-1 rounded-full text-sm font-medium transition-all capitalize",
                  defaultStatus === s
                    ? "bg-white text-black shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "watched" ? "Watched" : "Watchlist"}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {preview.source === "list"
              ? "Applies to all titles (add a "Watchlist" heading to override per-section)"
              : preview.source === "generic" || preview.source === "cinevault"
              ? "Applies to rows without a status column"
              : "Applies to all titles without an explicit status"}
          </span>
        </div>
      )}

      {/* Drop zone + textarea */}
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {text.trim().length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none select-none py-8">
            <Upload className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Drop a .csv or .txt file here, or paste below
            </p>
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => handleText(e.target.value)}
          placeholder=""
          className="min-h-[200px] bg-transparent border-0 focus-visible:ring-0 resize-y font-mono text-sm"
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Actions row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
          <FileText className="w-4 h-4" /> Browse file
        </Button>

        {preview.rows.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {sourceLabel[preview.source] && (
              <span className="text-primary font-medium mr-1">{sourceLabel[preview.source]}</span>
            )}
            {preview.rows.length} row{preview.rows.length !== 1 ? "s" : ""} ready
          </span>
        )}

        <Button
          onClick={runImport}
          disabled={importing || preview.rows.length === 0}
          className="ml-auto gap-2 bg-white text-black hover:bg-white/90"
        >
          {importing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
          ) : (
            <><Upload className="w-4 h-4" /> Import {preview.rows.length > 0 ? preview.rows.length : ""} movies</>
          )}
        </Button>
      </div>

      {/* Progress bar */}
      {importing && progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Matching movies on TMDB…</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 rounded-full"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Added",      value: result.summary.added,               color: "text-green-400" },
              { label: "Updated",    value: result.summary.updated ?? 0,        color: "text-blue-400" },
              { label: "Duplicates", value: result.summary.duplicates,          color: "text-yellow-400" },
              { label: "Not found",  value: result.summary.notFound,            color: "text-red-400" },
              { label: "Errors",     value: result.summary.errors,              color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-border bg-card/50 p-3 text-center">
                <p className={cn("text-2xl font-bold font-mono", color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-card/50 border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium">Results</p>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => { setText(""); setPreview({ rows: [], source: "" }); setResult(null); }}
              >
                <RefreshCw className="w-3 h-3" /> Start over
              </Button>
            </div>
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {result.results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  {STATUS_ICON[r.status]}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{r.movieTitle ?? r.title}</p>
                    {r.movieTitle && r.movieTitle !== r.title && (
                      <p className="text-xs text-muted-foreground truncate">searched: {r.title}</p>
                    )}
                  </div>
                  <span className={cn(
                    "text-xs shrink-0",
                    r.status === "added"     ? "text-green-400"  :
                    r.status === "updated"   ? "text-blue-400"   :
                    r.status === "duplicate" ? "text-yellow-400" : "text-red-400"
                  )}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
