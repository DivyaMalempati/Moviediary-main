import { Router, type IRouter } from "express";
import {
  SearchTmdbQueryParams,
  GetSimilarMoviesParams,
  GetTmdbRecommendationsParams,
  GetWatchProvidersParams,
  DiscoverIndianQueryParams,
} from "@workspace/api-zod";
import {
  searchMovies,
  getTrendingIndia,
  discoverIndian,
  getSimilarMovies,
  getRecommendations,
  getWatchProviders,
  getWatchProviderCatalog,
  getMovieDetails,
  getAllGenres,
  getOnboardingSeedMovies,
  getUpcomingReleases,
} from "../lib/tmdb.js";
import { TROPE_KEYWORDS } from "../lib/tropes.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

// TMDB proxy burns shared quota — require guest or signed-in session.
router.use(requireAuth);

// GET /tmdb/tropes — curated niche keyword / trope catalog
router.get("/tmdb/tropes", (_req, res): void => {
  res.json(TROPE_KEYWORDS);
});

// GET /tmdb/onboarding-seed — dense popular posters for taste seeding
router.get("/tmdb/onboarding-seed", async (_req, res): Promise<void> => {
  try {
    const results = await getOnboardingSeedMovies();
    res.json(results);
  } catch {
    res.status(502).json({ error: "Failed to load seed movies" });
  }
});

// GET /tmdb/genres — canonical {id, name} list, used by the onboarding genre picker
router.get("/tmdb/genres", async (_req, res): Promise<void> => {
  try {
    const genres = await getAllGenres();
    res.json(genres);
  } catch {
    res.status(502).json({ error: "Failed to load genres" });
  }
});

// GET /tmdb/search
router.get("/tmdb/search", async (req, res): Promise<void> => {
  const parsed = SearchTmdbQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const results = await searchMovies(parsed.data.q, parsed.data.region ?? "IN");
  res.json(results);
});

// GET /tmdb/trending-india
router.get("/tmdb/trending-india", async (_req, res): Promise<void> => {
  const results = await getTrendingIndia();
  res.json(results);
});

// GET /tmdb/upcoming?region=IN&language=te&days=90
router.get("/tmdb/upcoming", async (req, res): Promise<void> => {
  const regionRaw = (req.query.region as string | undefined) ?? "IN";
  const region = /^[A-Z]{2}$/i.test(regionRaw) ? regionRaw.toUpperCase() : "IN";
  const languageRaw = (req.query.language as string | undefined)?.trim();
  const language =
    languageRaw && /^[a-z]{2}$/i.test(languageRaw) ? languageRaw.toLowerCase() : undefined;
  const daysRaw = parseInt(String(req.query.days ?? "90"), 10);
  const days = Number.isFinite(daysRaw) ? daysRaw : 90;

  try {
    const results = await getUpcomingReleases({ region, language, days });
    res.json(results);
  } catch {
    res.status(502).json({ error: "Failed to load upcoming releases" });
  }
});

// GET /tmdb/discover-indian
router.get("/tmdb/discover-indian", async (req, res): Promise<void> => {
  const parsed = DiscoverIndianQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const results = await discoverIndian(parsed.data.language ?? undefined);
  res.json(results);
});

// GET /tmdb/watch-providers/:tmdbId?watchRegion=IN
router.get("/tmdb/watch-providers/:tmdbId", async (req, res): Promise<void> => {
  const params = GetWatchProvidersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const watchRegionRaw = (req.query.watchRegion as string | undefined) ?? "IN";
  const watchRegion = /^[A-Z]{2}$/.test(watchRegionRaw) ? watchRegionRaw : "IN";
  const result = await getWatchProviders(params.data.tmdbId, watchRegion);
  res.json(result);
});

// GET /tmdb/watch-provider-catalog?watchRegion=IN
router.get("/tmdb/watch-provider-catalog", async (req, res): Promise<void> => {
  const watchRegionRaw = (req.query.watchRegion as string | undefined) ?? "IN";
  const watchRegion = /^[A-Z]{2}$/.test(watchRegionRaw) ? watchRegionRaw : "IN";
  try {
    const catalog = await getWatchProviderCatalog(watchRegion);
    res.json(catalog);
  } catch (err) {
    res.status(502).json({ error: "Failed to load provider catalog" });
  }
});

// GET /tmdb/similar/:tmdbId
router.get("/tmdb/similar/:tmdbId", async (req, res): Promise<void> => {
  const params = GetSimilarMoviesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const results = await getSimilarMovies(params.data.tmdbId);
  res.json(results);
});

// GET /tmdb/recommendations/:tmdbId
router.get("/tmdb/recommendations/:tmdbId", async (req, res): Promise<void> => {
  const params = GetTmdbRecommendationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const results = await getRecommendations(params.data.tmdbId);
  res.json(results);
});

// GET /tmdb/movie/:tmdbId — fetch details for a single TMDB film by ID
router.get("/tmdb/movie/:tmdbId", async (req, res): Promise<void> => {
  const tmdbId = parseInt(req.params.tmdbId, 10);
  if (isNaN(tmdbId)) {
    res.status(400).json({ error: "Invalid tmdbId" });
    return;
  }
  try {
    const details = await getMovieDetails(tmdbId);
    res.json(details);
  } catch {
    res.status(404).json({ error: "Film not found" });
  }
});

/**
 * GET /tmdb/poster-image?path=/abc.jpg&size=w780
 * Same-origin proxy so the share-card canvas can draw posters without
 * CORS-tainting on Replit / Safari (direct image.tmdb.org often fails).
 */
router.get("/tmdb/poster-image", async (req, res): Promise<void> => {
  const pathRaw = typeof req.query.path === "string" ? req.query.path : "";
  // TMDB paths look like "/abc123.jpg" — reject anything else.
  if (!/^\/[A-Za-z0-9_./-]+\.(jpg|jpeg|png|webp)$/i.test(pathRaw) || pathRaw.includes("..")) {
    res.status(400).json({ error: "Invalid poster path" });
    return;
  }
  const sizeRaw = typeof req.query.size === "string" ? req.query.size : "w780";
  const size = ["w185", "w342", "w500", "w780", "original"].includes(sizeRaw)
    ? sizeRaw
    : "w780";

  try {
    const upstream = await fetch(`https://image.tmdb.org/t/p/${size}${pathRaw}`);
    if (!upstream.ok) {
      res.status(502).json({ error: "Failed to fetch poster" });
      return;
    }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.send(buf);
  } catch {
    res.status(502).json({ error: "Failed to fetch poster" });
  }
});

export default router;
