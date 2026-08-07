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

  // Core Together pairing + invite codes (may be missing if only contacts migration ran).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "partner_links" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_low_id" text NOT NULL,
      "user_high_id" text NOT NULL,
      "status" text DEFAULT 'active' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "ended_at" timestamp with time zone
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "partner_links_pair_unique"
      ON "partner_links" ("user_low_id", "user_high_id")
      WHERE "status" = 'active';
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "partner_links_low_idx"
      ON "partner_links" ("user_low_id");
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "partner_links_high_idx"
      ON "partner_links" ("user_high_id");
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "partner_invites" (
      "id" serial PRIMARY KEY NOT NULL,
      "code" text NOT NULL UNIQUE,
      "creator_user_id" text NOT NULL,
      "contact_id" integer,
      "recipient_name" text,
      "expires_at" timestamp with time zone NOT NULL,
      "redeemed_by_user_id" text,
      "redeemed_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "partner_invites_creator_idx"
      ON "partner_invites" ("creator_user_id");
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "match_sessions" (
      "id" serial PRIMARY KEY NOT NULL,
      "partner_link_id" integer NOT NULL,
      "created_by_user_id" text NOT NULL,
      "status" text DEFAULT 'active' NOT NULL,
      "deck" jsonb NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "completed_at" timestamp with time zone
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "match_sessions_partner_idx"
      ON "match_sessions" ("partner_link_id");
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "match_sessions_creator_idx"
      ON "match_sessions" ("created_by_user_id");
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "match_session_swipes" (
      "id" serial PRIMARY KEY NOT NULL,
      "session_id" integer NOT NULL,
      "user_id" text NOT NULL,
      "tmdb_id" integer NOT NULL,
      "direction" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "match_swipes_unique"
      ON "match_session_swipes" ("session_id", "user_id", "tmdb_id");
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "match_swipes_session_idx"
      ON "match_session_swipes" ("session_id");
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

  // Collection share: private/public + opaque share token.
  await pool.query(`
    ALTER TABLE "collections"
      ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'private' NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE "collections"
      ADD COLUMN IF NOT EXISTS "share_token" text;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "collections_share_token_unique"
      ON "collections" ("share_token");
  `);

  logger.info("Schema ensure complete");
}
