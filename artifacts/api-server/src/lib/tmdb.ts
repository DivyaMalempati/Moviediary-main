const TMDB_BASE = "https://api.themoviedb.org/3";

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error("TMDB_API_KEY is not set");
  }
  return key;
}

async function tmdbFetch(path: string, params: Record<string, string> = {}): Promise<Response> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getApiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status} ${res.statusText}`);
  }
  return res;
}

// ── Genre id/name map (cached in-memory) ────────────────────────────────────
// TMDB's discover/similar/recommendations/trending endpoints return
// `genre_ids: number[]`, NOT full `genres: [{id,name}]` objects — only the
// single-movie `/movie/{id}` endpoint returns names directly. Without this,
// `.genres` came back null for every list-type endpoint, which is why genre
// pills on swipe/suggestion cards were silently empty, and why genre-based
// personalization had nothing reliable to filter on.
let genreMapCache: { idToName: Map<number, string>; nameToId: Map<string, number>; fetchedAt: number } | null = null;
const GENRE_MAP_TTL_MS = 24 * 60 * 60 * 1000; // 24h — TMDB's genre list is effectively static

async function getGenreMaps(): Promise<{ idToName: Map<number, string>; nameToId: Map<string, number> }> {
  if (genreMapCache && Date.now() - genreMapCache.fetchedAt < GENRE_MAP_TTL_MS) {
    return genreMapCache;
  }
  const res = await tmdbFetch("/genre/movie/list");
  const data = (await res.json()) as { genres: Array<{ id: number; name: string }> };
  const idToName = new Map(data.genres.map((g) => [g.id, g.name]));
  const nameToId = new Map(data.genres.map((g) => [g.name, g.id]));
  genreMapCache = { idToName, nameToId, fetchedAt: Date.now() };
  return genreMapCache;
}

/** Exposed for personalization.ts — resolves the user's stored genre names to TMDB genre IDs. */
export async function getGenreNameToIdMap(): Promise<Map<string, number>> {
  const { nameToId } = await getGenreMaps();
  return nameToId;
}

/** Exposed for the onboarding genre picker — full {id, name} list, TMDB's canonical set. */
export async function getAllGenres(): Promise<Array<{ id: number; name: string }>> {
  const { nameToId } = await getGenreMaps();
  return [...nameToId.entries()].map(([name, id]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface TmdbMovieRaw {
  id: number;
  title: string;
  original_title?: string;
  poster_path?: string | null;
  release_date?: string;
  original_language?: string;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  overview?: string;
  vote_average?: number;
  runtime?: number | null;
}

function mapTmdbMovie(m: TmdbMovieRaw, idToName?: Map<number, string>) {
  const releaseYear = m.release_date ? parseInt(m.release_date.split("-")[0], 10) : null;

  // Prefer full genre objects (single-movie detail endpoint); fall back to
  // resolving genre_ids via the cached map (discover/similar/recs/trending).
  const genres = m.genres
    ? m.genres.map((g) => g.name)
    : m.genre_ids && idToName
      ? m.genre_ids.map((id) => idToName.get(id)).filter((n): n is string => !!n)
      : undefined;

  return {
    tmdbId: m.id,
    title: m.title,
    originalTitle: m.original_title ?? null,
    posterPath: m.poster_path ?? null,
    releaseYear: releaseYear || null,
    releaseDate: m.release_date && /^\d{4}-\d{2}-\d{2}/.test(m.release_date)
      ? m.release_date.slice(0, 10)
      : null,
    originalLanguage: m.original_language ?? null,
    genres: genres && genres.length > 0 ? genres : null,
    overview: m.overview ?? null,
    voteAverage: m.vote_average ?? null,
  };
}

export async function searchMovies(query: string, region = "IN") {
  const [res, { idToName }] = await Promise.all([
    tmdbFetch("/search/movie", { query, region, include_adult: "false" }),
    getGenreMaps(),
  ]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

export async function getMovieDetails(tmdbId: number) {
  // append_to_response=credits pulls cast/crew in one round-trip so swipe
  // flip-details (and any other callers) can show director + top billed actors
  // without a second TMDB request.
  const res = await tmdbFetch(`/movie/${tmdbId}`, { append_to_response: "credits" });
  const data = (await res.json()) as TmdbMovieRaw & {
    credits?: {
      cast?: Array<{ name: string; order?: number }>;
      crew?: Array<{ name: string; job: string }>;
    };
  };
  const mapped = mapTmdbMovie(data);
  const director =
    data.credits?.crew?.find((c) => c.job === "Director")?.name ?? null;
  const cast = (data.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 5)
    .map((c) => c.name);
  const runtimeMinutes =
    typeof data.runtime === "number" && data.runtime > 0 ? data.runtime : null;
  return { ...mapped, director, cast, runtimeMinutes };
}

export async function getSimilarMovies(tmdbId: number) {
  const [res, { idToName }] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}/similar`),
    getGenreMaps(),
  ]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

export async function getRecommendations(tmdbId: number) {
  const [res, { idToName }] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}/recommendations`),
    getGenreMaps(),
  ]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

export async function getTrendingIndia() {
  const [res, { idToName }] = await Promise.all([
    tmdbFetch("/trending/movie/week", { region: "IN" }),
    getGenreMaps(),
  ]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

function yyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Upcoming theatrical/digital releases for a region (default India).
 * Uses discover with a release-date window so we get a full date, not just year.
 */
export async function getUpcomingReleases(opts?: {
  region?: string;
  language?: string;
  days?: number;
}) {
  const region = opts?.region || "IN";
  const days = Math.min(180, Math.max(14, opts?.days ?? 90));
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + days);

  const params: Record<string, string> = {
    region,
    sort_by: "primary_release_date.asc",
    include_adult: "false",
    "primary_release_date.gte": yyyyMmDd(today),
    "primary_release_date.lte": yyyyMmDd(end),
    "vote_count.gte": "1",
    page: "1",
  };

  if (opts?.language) {
    params.with_original_language = opts.language;
  } else {
    // India-first mix: major Indian languages + English releases in the region.
    params.with_original_language = "te|ta|ml|kn|hi|en";
  }

  const [res, { idToName }] = await Promise.all([
    tmdbFetch("/discover/movie", params),
    getGenreMaps(),
  ]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results
    .map((m) => mapTmdbMovie(m, idToName))
    .filter((m) => !!m.releaseDate)
    .sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
}

export async function getWatchProviders(tmdbId: number, watchRegion = "IN") {
  const res = await tmdbFetch(`/movie/${tmdbId}/watch/providers`);
  const data = (await res.json()) as {
    results?: Record<
      string,
      {
        link?: string;
        flatrate?: Array<{ provider_id: number; provider_name: string; logo_path?: string }>;
        rent?: Array<{ provider_id: number; provider_name: string; logo_path?: string }>;
        buy?: Array<{ provider_id: number; provider_name: string; logo_path?: string }>;
      }
    >;
  };

  const region = data.results?.[watchRegion] ?? data.results?.IN;
  const mapProvider = (p: { provider_id: number; provider_name: string; logo_path?: string }) => ({
    providerId: p.provider_id,
    name: p.provider_name,
    logoPath: p.logo_path ? p.logo_path : null,
  });

  return {
    tmdbId,
    watchRegion,
    link: region?.link ?? null,
    flatrate: region?.flatrate?.map(mapProvider) ?? null,
    rent: region?.rent?.map(mapProvider) ?? null,
    buy: region?.buy?.map(mapProvider) ?? null,
  };
}

/** Catalog of streaming providers for a watch region (for preference pickers). */
export async function getWatchProviderCatalog(watchRegion = "IN") {
  const res = await tmdbFetch("/watch/providers/movie", { watch_region: watchRegion });
  const data = (await res.json()) as {
    results?: Array<{
      provider_id: number;
      provider_name: string;
      logo_path?: string;
      display_priority?: number;
    }>;
  };

  return (data.results ?? [])
    .map((p) => ({
      providerId: p.provider_id,
      name: p.provider_name,
      logoPath: p.logo_path ?? null,
      displayPriority: p.display_priority ?? 999,
    }))
    .sort((a, b) => a.displayPriority - b.displayPriority || a.name.localeCompare(b.name));
}

export type WatchFilter = {
  providerIds?: number[];
  watchRegion?: string;
};

/** India CBFC max certification for discover (U ⊂ UA ⊂ A). */
export type CertificationFilter = {
  country?: string;
  /** Max allowed: U, UA, or A. A / unset = no certification filter. */
  max?: string | null;
};

function applyWatchFilter(params: Record<string, string>, watch?: WatchFilter) {
  if (!watch?.providerIds?.length) return;
  params.with_watch_providers = watch.providerIds.join("|");
  params.watch_region = watch.watchRegion || "IN";
  params.with_watch_monetization_types = "flatrate";
}

function applyCertificationFilter(params: Record<string, string>, cert?: CertificationFilter) {
  const max = cert?.max?.toUpperCase();
  if (!max || max === "A") return;
  if (max !== "U" && max !== "UA") return;
  params.certification_country = cert?.country || "IN";
  params["certification.lte"] = max;
}

export async function discoverIndian(language?: string) {
  const params: Record<string, string> = {
    region: "IN",
    sort_by: "popularity.desc",
    include_adult: "false",
  };
  if (language) {
    params.with_original_language = language;
  } else {
    params.with_original_language = "te|ta|ml|kn|hi";
  }
  const [res, { idToName }] = await Promise.all([tmdbFetch("/discover/movie", params), getGenreMaps()]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

/** Generic discover — pass an array of ISO 639-1 language codes to filter. */
export async function discoverMovies(
  languages?: string[],
  region?: string,
  page = 1,
  genreId?: number,
  watch?: WatchFilter,
  extras?: DiscoverExtras,
) {
  const params: Record<string, string> = {
    sort_by: extras?.sortBy ?? "popularity.desc",
    include_adult: "false",
    "vote_count.gte": String(extras?.voteCountGte ?? 50),
    page: String(Math.max(1, page)),
  };
  if (extras?.voteCountLte != null) {
    params["vote_count.lte"] = String(extras.voteCountLte);
  }
  if (extras?.voteAverageGte != null) {
    params["vote_average.gte"] = String(extras.voteAverageGte);
  }
  if (extras?.keywordId != null) {
    params.with_keywords = String(extras.keywordId);
  }
  if (languages?.length) {
    params.with_original_language = languages.join("|");
  }
  if (region) {
    params.region = region;
  }
  if (genreId) {
    params.with_genres = String(genreId);
  }
  applyWatchFilter(params, watch);
  applyCertificationFilter(params, extras?.certification);
  const [res, { idToName }] = await Promise.all([tmdbFetch("/discover/movie", params), getGenreMaps()]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

export type DiscoverExtras = {
  sortBy?: string;
  voteCountGte?: number;
  voteCountLte?: number;
  voteAverageGte?: number;
  keywordId?: number;
  certification?: CertificationFilter;
};

/** High-rated titles available on the user's OTT apps (streaming bucket). */
export async function discoverStreamingHighlights(
  languages: string[] | undefined,
  page: number,
  genreId: number | undefined,
  watch: WatchFilter,
  certification?: CertificationFilter,
) {
  return discoverMovies(languages, watch.watchRegion || "IN", page, genreId, watch, {
    sortBy: "vote_average.desc",
    voteCountGte: 100,
    voteAverageGte: 6.5,
    certification,
  });
}

/**
 * Hidden gems / wildcards: strong ratings, low vote count (less mainstream).
 * vote_average >= 7.2 and vote_count <= 3000.
 */
export async function discoverHiddenGems(
  languages?: string[],
  page = 1,
  genreId?: number,
  watch?: WatchFilter,
  certification?: CertificationFilter,
) {
  return discoverMovies(languages, undefined, page, genreId, watch, {
    sortBy: "vote_average.desc",
    voteCountGte: 50,
    voteCountLte: 3000,
    voteAverageGte: 7.2,
    certification,
  });
}

/** Discover by a specific TMDB keyword (trope) ID. */
export async function discoverByKeyword(
  keywordId: number,
  languages?: string[],
  page = 1,
  genreId?: number,
  watch?: WatchFilter,
  certification?: CertificationFilter,
) {
  return discoverMovies(languages, undefined, page, genreId, watch, {
    sortBy: "popularity.desc",
    voteCountGte: 30,
    keywordId,
    certification,
  });
}

/** Acclaimed/iconic discover — high vote_average, minimum vote_count threshold. */
export async function discoverIconicMovies(
  languages?: string[],
  page = 1,
  genreId?: number,
  watch?: WatchFilter,
  certification?: CertificationFilter,
) {
  const params: Record<string, string> = {
    sort_by: "vote_average.desc",
    include_adult: "false",
    "vote_count.gte": "500",
    page: String(Math.max(1, page)),
  };
  if (languages?.length) {
    params.with_original_language = languages.join("|");
  }
  if (genreId) {
    params.with_genres = String(genreId);
  }
  applyWatchFilter(params, watch);
  applyCertificationFilter(params, certification);
  const [res, { idToName }] = await Promise.all([tmdbFetch("/discover/movie", params), getGenreMaps()]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

/** Trending movies, optionally filtered to a region. */
export async function getTrending(region?: string) {
  const params: Record<string, string> = {};
  if (region) params.region = region;
  const [res, { idToName }] = await Promise.all([tmdbFetch("/trending/movie/week", params), getGenreMaps()]);
  const data = (await res.json()) as { results: TmdbMovieRaw[] };
  return data.results.map((m) => mapTmdbMovie(m, idToName));
}

/**
 * Dense popular poster set for onboarding "tell us what you've seen" seeding.
 * Mixes India trending + popular Indian-language discover pages.
 */
export async function getOnboardingSeedMovies() {
  const [trendingIn, popularHi, popularTe, popularEn, popularTa] = await Promise.all([
    getTrending("IN").catch(() => []),
    discoverMovies(["hi"], "IN", 1).catch(() => []),
    discoverMovies(["te"], "IN", 1).catch(() => []),
    discoverMovies(["en"], "IN", 1).catch(() => []),
    discoverMovies(["ta"], "IN", 1).catch(() => []),
  ]);

  const seen = new Set<number>();
  const out: ReturnType<typeof mapTmdbMovie>[] = [];
  for (const m of [...trendingIn, ...popularHi, ...popularTe, ...popularEn, ...popularTa]) {
    if (!m.tmdbId || !m.posterPath || seen.has(m.tmdbId)) continue;
    seen.add(m.tmdbId);
    out.push(m);
    if (out.length >= 48) break;
  }
  return out;
}

