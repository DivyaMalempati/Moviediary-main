/**
 * Diary notes from Sentence log store only "with who" + personal review —
 * never the full “Watched Title earlier with …” sentence (that polluted Share).
 *
 * Format when both present:
 *   With Family
 *
 *   Awesome movie, great pace.
 */

export type DiaryNoteParts = {
  withWho: string | null;
  review: string | null;
};

export function buildDiaryNote(opts: { withWho?: string; felt?: string }): string {
  const withPart = (opts.withWho ?? "").trim();
  const feltPart = (opts.felt ?? "").trim();
  if (withPart && feltPart) return `With ${withPart}\n\n${feltPart}`;
  if (withPart) return `With ${withPart}`;
  return feltPart;
}

/** Split stored notes into with-who + review for Share / UI. */
export function splitDiaryNote(notes: string | null | undefined): DiaryNoteParts {
  const raw = notes?.trim() ?? "";
  if (!raw) return { withWho: null, review: null };

  const structured = raw.match(/^With\s+(.+?)\n\n([\s\S]+)$/i);
  if (structured) {
    return { withWho: structured[1].trim(), review: structured[2].trim() };
  }

  const withOnly = raw.match(/^With\s+(.+)$/i);
  if (withOnly && !raw.includes("\n")) {
    return { withWho: withOnly[1].trim(), review: null };
  }

  // Legacy sentence-log: “Watched Title earlier with Family. Review text”
  const legacyWith = raw.match(
    /^Watched\s+.+?\s+(?:today|earlier|recently)\s+with\s+(.+?)\.\s*([\s\S]*)$/i,
  );
  if (legacyWith) {
    const withWho = legacyWith[1].trim() || null;
    const review = legacyWith[2].trim() || null;
    return { withWho, review };
  }

  const legacySolo = raw.match(
    /^Watched\s+.+?\s+(?:today|earlier|recently)\.\s*([\s\S]*)$/i,
  );
  if (legacySolo) {
    const review = legacySolo[1].trim() || null;
    return { withWho: null, review };
  }

  return { withWho: null, review: raw };
}
