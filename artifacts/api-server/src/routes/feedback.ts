import { Router, type IRouter } from "express";
import { db, featureFeedbackTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const MAX_MESSAGE = 2000;
const ALLOWED_SOURCES = new Set(["prompt", "profile"]);
const ALLOWED_CATEGORIES = new Set([
  "logging",
  "discover",
  "together",
  "reminders",
  "import_export",
  "other",
]);

/**
 * POST /feedback
 * Save a feature request from Profile or the soft on-load prompt.
 */
router.post("/feedback", requireAuth, async (req: any, res): Promise<void> => {
  const raw =
    typeof req.body?.message === "string" ? req.body.message.trim().replace(/\s+/g, " ") : "";
  if (!raw || raw.length < 3) {
    res.status(400).json({ error: "Tell us a bit more about the feature you’d like." });
    return;
  }
  if (raw.length > MAX_MESSAGE) {
    res.status(400).json({ error: "Message is too long" });
    return;
  }

  const sourceRaw = typeof req.body?.source === "string" ? req.body.source.trim() : "profile";
  const source = ALLOWED_SOURCES.has(sourceRaw) ? sourceRaw : "profile";

  let category: string | null = null;
  if (typeof req.body?.category === "string" && req.body.category.trim()) {
    const c = req.body.category.trim();
    if (!ALLOWED_CATEGORIES.has(c)) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    category = c;
  }

  const [row] = await db
    .insert(featureFeedbackTable)
    .values({
      userId: req.userId,
      source,
      category,
      message: raw,
    })
    .returning();

  logger.info(
    {
      feedbackId: row.id,
      userId: req.userId,
      source,
      category,
      messagePreview: raw.slice(0, 120),
    },
    "feature_feedback_received",
  );

  res.status(201).json({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
