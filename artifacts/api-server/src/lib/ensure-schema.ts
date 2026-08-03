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

  // Named Together invites (contacts + invite metadata).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "partner_contacts" (
      "id" serial PRIMARY KEY NOT NULL,
      "owner_user_id" text NOT NULL,
      "display_name" text NOT NULL,
      "partner_user_id" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "partner_contacts_owner_idx"
      ON "partner_contacts" ("owner_user_id");
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "partner_contacts_partner_idx"
      ON "partner_contacts" ("partner_user_id");
  `);

  await pool.query(`
    ALTER TABLE "partner_invites"
      ADD COLUMN IF NOT EXISTS "contact_id" integer;
  `);
  await pool.query(`
    ALTER TABLE "partner_invites"
      ADD COLUMN IF NOT EXISTS "recipient_name" text;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "partner_invites_contact_idx"
      ON "partner_invites" ("contact_id");
  `);

  // First watch day (distinct from last-watched / rewatch dates).
  await pool.query(`
    ALTER TABLE "movies"
      ADD COLUMN IF NOT EXISTS "first_watched_at" timestamp with time zone;
  `);
  await pool.query(`
    UPDATE "movies"
    SET "first_watched_at" = "watched_at"
    WHERE "first_watched_at" IS NULL
      AND "rewatch_count" = 0
      AND "watched_at" IS NOT NULL;
  `);

  logger.info("Schema ensure complete");
}
