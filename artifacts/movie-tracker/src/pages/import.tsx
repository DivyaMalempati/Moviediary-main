import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload, FileText, CheckCircle2, XCircle, AlertCircle,
  Loader2, Download, Copy, RefreshCw,
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

// ── CSV parser (client-side) ─────────────────────────────────────────────────

/** Split one CSV line into fields, respecting double-quoted values. */
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

function parseCSV(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect header
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("title") || first.includes("status") || first.includes("rating");

  if (hasHeader) {
    // Use named columns so any column order works (handles both import template
    // and the CSV exported from the Watched page).
    const headerCols = splitCSVLine(lines[0]).map((c) => c.toLowerCase().trim());
    const idx = (name: string) => headerCols.indexOf(name);
    const titleIdx  = idx("title");
    const statusIdx = idx("status");
    const ratingIdx = idx("rating");
    const yearIdx   = idx("year");

    return lines.slice(1).map((line) => {
      const cols = splitCSVLine(line);
      const title = (titleIdx >= 0 ? cols[titleIdx] : cols[0]) ?? "";
      const statusRaw = (statusIdx >= 0 ? cols[statusIdx] : "") ?? "";
      const status = (["watched", "watchlist"].includes(statusRaw.toLowerCase())
        ? statusRaw.toLowerCase()
        : "watched") as "watched" | "watchlist";
      const ratingRaw = (ratingIdx >= 0 ? cols[ratingIdx] : "") ?? "";
      const rating = ratingRaw || undefined;
      const yearRaw = (yearIdx >= 0 ? cols[yearIdx] : "") ?? "";
      const year = yearRaw ? parseInt(yearRaw, 10) || undefined : undefined;
      return { title, status, rating, year };
    }).filter((r) => r.title.length > 0);
  }

  // No header — fall back to positional (title, status, rating, year)
  return lines.map((line) => {
    const cols = splitCSVLine(line);
    const title = cols[0] ?? "";
    const status = (["watched", "watchlist"].includes(cols[1]?.toLowerCase())
      ? cols[1].toLowerCase()
      : "watched") as "watched" | "watchlist";
    const rating = cols[2] || undefined;
    const year = cols[3] ? parseInt(cols[3], 10) || undefined : undefined;
    return { title, status, rating, year };
  }).filter((r) => r.title.length > 0);
}

// Strip emoji characters from a string
function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalise a line to a potential status heading, e.g. "# Watched", "Watchlist:", "WATCHLIST"
function asStatusHeading(line: string): "watched" | "watchlist" | null {
  const norm = line.replace(/^#+\s*/, "").replace(/:$/, "").trim().toLowerCase();
  if (norm === "watched") return "watched";
  if (norm === "watchlist") return "watchlist";
  return null;
}

// Plain title list (one per line, no commas needed).
// Supports:
//   - Optional section headings: "Watched" / "Watchlist"
//   - Numbered lists: "1. Title", "1) Title"
//   - Emojis (stripped automatically)
//   - Parenthetical notes after the title are preserved for the search to handle
function parseTitleList(text: string): ImportRow[] {
  let currentStatus: "watched" | "watchlist" = "watched";
  const results: ImportRow[] = [];

  // Detect if this is a numbered list (e.g. "1. Title")
  const isNumbered = /^\s*\d+[.)]\s+\S/.test(text);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Status heading?
    const heading = asStatusHeading(stripEmoji(line));
    if (heading) { currentStatus = heading; continue; }

    // Plain comment
    if (line.startsWith("//")) continue;

    if (isNumbered) {
      // Only process lines that match "N. Title" or "N) Title" — skip prose headers/footers
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

// ── Template CSV content ─────────────────────────────────────────────────────
const TEMPLATE_CSV = `title,status,rating,year,language
"Baahubali 2: The Conclusion",watched,very_good,2017,te
"RRR",watched,loved,2022,te
"The Dark Knight",watched,loved,2008,en
"Parasite",watched,loved,2019,ko
"My watchlist film",watchlist,,2025,en`;

const STATUS_ICON: Record<ResultRow["status"], React.ReactNode> = {
  added: <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />,
  updated: <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />,
  duplicate: <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />,
  not_found: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
  error: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
};

const STATUS_LABEL: Record<ResultRow["status"], string> = {
  added: "Added",
  updated: "Rating updated",
  duplicate: "Already in library",
  not_found: "Not found on TMDB",
  error: "Error",
};

// ── Component ────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const parse = useCallback((raw: string) => {
    const hasCsv = raw.includes(",");
    const rows = hasCsv ? parseCSV(raw) : parseTitleList(raw);
    setPreview(rows);
    return rows;
  }, []);

  const handleText = (val: string) => {
    setText(val);
    if (val.trim()) parse(val);
    else setPreview([]);
  };

  const handleFile = (file: File) => {
    file.text().then((content) => {
      setText(content);
      parse(content);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const runImport = async () => {
    const rows = parse(text);
    if (rows.length === 0) { toast.error("Nothing to import — paste titles or upload a CSV"); return; }

    setImporting(true);
    setResult(null);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });

      const res = await fetch(`${BASE}/api/import`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }
      const data: ImportResult = await res.json();
      setResult(data);

      // Invalidate library + stats queries
      qc.invalidateQueries({ queryKey: getListMoviesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetMovieStatsQueryKey() });

      const added = data.summary.added;
      const updated = data.summary.updated ?? 0;
      if (added > 0 || updated > 0) {
        const parts: string[] = [];
        if (added > 0) parts.push(`${added} movie${added !== 1 ? "s" : ""} added`);
        if (updated > 0) parts.push(`${updated} rating${updated !== 1 ? "s" : ""} updated`);
        toast.success(parts.join(", "));
      } else {
        toast.info("No new movies were added");
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cinevault_import_template.csv";
    a.click();
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(TEMPLATE_CSV);
    toast.success("Template copied to clipboard");
  };

  return (
    <>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Import Movies</h1>
          <p className="text-muted-foreground text-sm">
            Paste a list of titles or upload a CSV. Each title is looked up on TMDB automatically.
          </p>
        </div>

        {/* Format hint */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accepted formats</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-foreground/80">Plain list with headings</p>
              <pre className="text-xs text-muted-foreground bg-background/60 rounded-lg p-3 font-mono">
{`Watched
RRR
The Dark Knight
Parasite

Watchlist
Dune Part Two
Oppenheimer`}
              </pre>
              <p className="text-xs text-muted-foreground">Heading sets the destination — "Watched" or "Watchlist". No heading = Watched.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground/80">CSV with metadata</p>
              <pre className="text-xs text-muted-foreground bg-background/60 rounded-lg p-3 font-mono">
{`title,status,rating,year
"RRR",watched,loved,2022
"Parasite",watchlist,,2019`}
              </pre>
              <p className="text-xs text-muted-foreground">Ratings: loved · great · very_good · good · ok · avg · meh</p>
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

        {/* File picker */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {/* Actions row */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="gap-2"
          >
            <FileText className="w-4 h-4" /> Browse file
          </Button>

          {preview.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {preview.length} row{preview.length !== 1 ? "s" : ""} detected
            </span>
          )}

          <Button
            onClick={runImport}
            disabled={importing || preview.length === 0}
            className="ml-auto gap-2 bg-white text-black hover:bg-white/90"
          >
            {importing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
            ) : (
              <><Upload className="w-4 h-4" /> Import {preview.length > 0 ? preview.length : ""} movies</>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Added", value: result.summary.added, color: "text-green-400" },
                { label: "Updated", value: result.summary.updated ?? 0, color: "text-blue-400" },
                { label: "Duplicates", value: result.summary.duplicates, color: "text-yellow-400" },
                { label: "Not found", value: result.summary.notFound, color: "text-red-400" },
                { label: "Errors", value: result.summary.errors, color: "text-red-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-border bg-card/50 p-3 text-center">
                  <p className={cn("text-2xl font-bold font-mono", color)}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Row details */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-card/50 border-b border-border flex items-center justify-between">
                <p className="text-sm font-medium">Results</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => { setText(""); setPreview([]); setResult(null); }}
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
                      r.status === "added" ? "text-green-400" :
                      r.status === "updated" ? "text-blue-400" :
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
    </>
  );
}
