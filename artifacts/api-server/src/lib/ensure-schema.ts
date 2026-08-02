import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Apply additive schema patches that must exist for the API to boot cleanly.
 * Safe to run repeatedly (IF NOT EXISTS). Covers Replit/deploys where
 * `drizzle-kit push` did not run after a schema merge.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE "user_preferences"
      ADD COLUMN IF NOT EXISTS "dismissed_tmdb_ids" integer[] DEFAULT '{}' NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "feature_feedback" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "source" text DEFAULT 'profile' NOT NULL,
      "category" text,
      "message" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "feature_feedback_user_idx"
      ON "feature_feedback" ("user_id");
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "feature_feedback_created_idx"
      ON "feature_feedback" ("created_at");
  `);

  logger.info("Schema ensure complete");
}
