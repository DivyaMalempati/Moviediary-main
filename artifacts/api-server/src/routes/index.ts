import { Router, type IRouter } from "express";
import healthRouter from "./health";
import moviesRouter from "./movies/index";
import tmdbRouter from "./tmdb";
import suggestionsRouter from "./suggestions";
import preferencesRouter from "./preferences";
import importRouter from "./import";
import collectionsRouter from "./collections";
import guestRouter from "./guest";
import discoverRouter from "./discover";

const router: IRouter = Router();

router.use(healthRouter);
router.use(guestRouter);
router.use(moviesRouter);
router.use(tmdbRouter);
router.use(suggestionsRouter);
router.use(preferencesRouter);
router.use(importRouter);
router.use(collectionsRouter);
router.use(discoverRouter);

export default router;
