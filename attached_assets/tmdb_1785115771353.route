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
  getMovieDetails,
  getAllGenres,
} from "../lib/tmdb.js";

const router: IRouter = Router();

// GET /tmdb/genres — canonical {id, name} list, used by the onboarding genre picker
router.get("/tmdb/genres", async (_req, res): Promise<void> => {
  const genres = await getAllGenres();
  res.json(genres);
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

// GET /tmdb/watch-providers/:tmdbId
router.get("/tmdb/watch-providers/:tmdbId", async (req, res): Promise<void> => {
  const params = GetWatchProvidersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await getWatchProviders(params.data.tmdbId);
  res.json(result);
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

export default router;
