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
import partnersRouter from "./partners";
import matchSessionsRouter from "./match-sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(guestRouter);
// Import/export + orphaned helpers register concrete /movies/* paths.
// Mount before moviesRouter so GET /movies/:id cannot steal /movies/export.
router.use(importRouter);
router.use(moviesRouter);
router.use(tmdbRouter);
router.use(suggestionsRouter);
router.use(preferencesRouter);
router.use(collectionsRouter);
router.use(discoverRouter);
router.use(partnersRouter);
router.use(matchSessionsRouter);

export default router;
