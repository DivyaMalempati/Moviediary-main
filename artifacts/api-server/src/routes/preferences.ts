import { Router, type IRouter } from "express";
import { db, userPreferencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router: IRouter = Router();

function validateBody(body: unknown): { preferredLanguages: string[]; preferredGenres: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const { preferredLanguages, preferredGenres } = body as Record<string, unknown>;

  if (!Array.isArray(preferredLanguages)) return null;
  if (preferredLanguages.length > 30) return null;
  if (preferredLanguages.some((l) => typeof l !== "string" || l.length < 2 || l.length > 3)) return null;

  const genres = preferredGenres ?? [];
  if (!Array.isArray(genres)) return null;
  if (genres.length > 20) return null;
  if (genres.some((g) => typeof g !== "string" || g.length > 40)) return null;

  return { preferredLanguages: preferredLanguages as string[], preferredGenres: genres as string[] };
}

// GET /preferences
router.get("/preferences", requireAuth, async (req: any, res): Promise<void> => {
  const [prefs] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, req.userId));

  res.json({
    preferredLanguages: prefs?.preferredLanguages ?? [],
    preferredGenres: prefs?.preferredGenres ?? [],
    onboardingCompletedAt: prefs?.onboardingCompletedAt ?? null,
  });
});

// PUT /preferences
router.put("/preferences", requireAuth, async (req: any, res): Promise<void> => {
  const data = validateBody(req.body);
  if (!data) {
    res.status(400).json({
      error: "Invalid body: preferredLanguages (2–3 char strings, max 30) and optional preferredGenres (max 20, ≤40 chars each) required",
    });
    return;
  }

  // Fetch the existing row first so we can preserve onboardingCompletedAt.
  // Using a raw sql template for COALESCE inside onConflictDoUpdate can emit
  // `excluded.<col>` (the new-value reference) instead of the existing row's
  // column, which would always overwrite the timestamp. A two-step read-then-
  // upsert is simpler and guaranteed correct.
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
      onboardingCompletedAt: stampedAt,
    })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: {
        preferredLanguages: data.preferredLanguages,
        preferredGenres: data.preferredGenres,
        onboardingCompletedAt: stampedAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({
    preferredLanguages: result.preferredLanguages,
    preferredGenres: result.preferredGenres,
    onboardingCompletedAt: result.onboardingCompletedAt,
  });
});

export default router;
