import { Router, type IRouter } from "express";
import { db, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

type PrefsBody = {
  preferredLanguages: string[];
  preferredGenres: string[];
  preferredProviders: number[];
  watchRegion: string;
};

function validateBody(body: unknown): PrefsBody | null {
  if (!body || typeof body !== "object") return null;
  const { preferredLanguages, preferredGenres, preferredProviders, watchRegion } = body as Record<string, unknown>;

  if (!Array.isArray(preferredLanguages)) return null;
  if (preferredLanguages.length > 30) return null;
  if (preferredLanguages.some((l) => typeof l !== "string" || l.length < 2 || l.length > 3)) return null;

  const genres = preferredGenres ?? [];
  if (!Array.isArray(genres)) return null;
  if (genres.length > 20) return null;
  if (genres.some((g) => typeof g !== "string" || g.length > 40)) return null;

  const providers = preferredProviders ?? [];
  if (!Array.isArray(providers)) return null;
  if (providers.length > 40) return null;
  if (providers.some((p) => typeof p !== "number" || !Number.isInteger(p) || p < 1)) return null;

  const region =
    typeof watchRegion === "string" && /^[A-Z]{2}$/.test(watchRegion)
      ? watchRegion
      : "IN";

  return {
    preferredLanguages: preferredLanguages as string[],
    preferredGenres: genres as string[],
    preferredProviders: providers as number[],
    watchRegion: region,
  };
}

function toResponse(prefs: typeof userPreferencesTable.$inferSelect | undefined) {
  return {
    preferredLanguages: prefs?.preferredLanguages ?? [],
    preferredGenres: prefs?.preferredGenres ?? [],
    preferredProviders: prefs?.preferredProviders ?? [],
    watchRegion: prefs?.watchRegion ?? "IN",
    onboardingCompletedAt: prefs?.onboardingCompletedAt ?? null,
  };
}

// GET /preferences
router.get("/preferences", requireAuth, async (req: any, res): Promise<void> => {
  const [prefs] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, req.userId));

  res.json(toResponse(prefs));
});

// PUT /preferences
router.put("/preferences", requireAuth, async (req: any, res): Promise<void> => {
  const data = validateBody(req.body);
  if (!data) {
    res.status(400).json({
      error:
        "Invalid body: preferredLanguages (2–3 char strings, max 30), preferredGenres (max 20), preferredProviders (positive ints, max 40), watchRegion (optional ISO country)",
    });
    return;
  }

  const [existing] = await db
    .select({ onboardingCompletedAt: userPreferencesTable.onboardingCompletedAt })
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, req.userId));

  const stampedAt = existing?.onboardingCompletedAt ?? new Date();

  const [result] = await db
    .insert(userPreferencesTable)
    .values({
      userId: req.userId,
      preferredLanguages: data.preferredLanguages,
      preferredGenres: data.preferredGenres,
      preferredProviders: data.preferredProviders,
      watchRegion: data.watchRegion,
      onboardingCompletedAt: stampedAt,
    })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: {
        preferredLanguages: data.preferredLanguages,
        preferredGenres: data.preferredGenres,
        preferredProviders: data.preferredProviders,
        watchRegion: data.watchRegion,
        onboardingCompletedAt: stampedAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(toResponse(result));
});

export default router;
