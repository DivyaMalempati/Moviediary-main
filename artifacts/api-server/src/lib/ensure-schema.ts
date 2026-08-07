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

  // Match session deck migration: replace JSONB blob with integer[] of tmdb_ids.
  // Step 1: add the new column (idempotent).
  await pool.query(`
    ALTER TABLE "match_sessions"
      ADD COLUMN IF NOT EXISTS "tmdb_ids" integer[] DEFAULT '{}' NOT NULL;
  `);
  // Steps 2-4 only apply while the legacy "deck" JSONB column still exists.
  // Use dynamic EXECUTE inside PL/pgSQL so that the SQL referencing "deck" is
  // only parsed at execution time — static embedded SQL is parsed at block
  // compilation time and would fail after the column has been dropped.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_sessions' AND column_name = 'deck'
      ) THEN
        -- Step 2: backfill tmdb_ids from the JSONB deck (empty rows only).
        EXECUTE $sql$
          UPDATE "match_sessions"
          SET "tmdb_ids" = ARRAY(
            SELECT (elem->>'tmdbId')::integer
            FROM jsonb_array_elements("deck") AS elem
            WHERE elem->>'tmdbId' IS NOT NULL
          )
          WHERE "tmdb_ids" = '{}'
            AND "deck" IS NOT NULL
            AND jsonb_typeof("deck") = 'array'
            AND jsonb_array_length("deck") > 0
        $sql$;

        -- Step 3: retroactively complete sessions where both partners swiped everything.
        EXECUTE $sql$
          UPDATE "match_sessions" ms
          SET "status" = 'completed', "completed_at" = NOW()
          FROM "partner_links" pl
          WHERE pl."id" = ms."partner_link_id"
            AND ms."status" = 'active'
            AND ms."completed_at" IS NULL
            AND (
              SELECT COUNT(*)
              FROM (
                SELECT s."user_id"
                FROM "match_session_swipes" s
                WHERE s."session_id" = ms."id"
                  AND s."user_id" IN (pl."user_low_id", pl."user_high_id")
                GROUP BY s."user_id"
                HAVING COUNT(*) >= jsonb_array_length(ms."deck")
              ) AS completed_users
            ) >= 2
        $sql$;

        -- Step 4: drop the old column now that migration is done.
        EXECUTE 'ALTER TABLE "match_sessions" DROP COLUMN "deck"';
      END IF;
    END $$;
  `);

  logger.info("Schema ensure complete");
}
