-- Task: Add preferred_genres to user_preferences
-- Safe for both fresh environments (table doesn't exist yet) and existing
-- environments where user_preferences was already created via drizzle push.

CREATE TABLE IF NOT EXISTS "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferred_languages" text[] DEFAULT '{}' NOT NULL,
	"preferred_genres" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Idempotent column add for environments where the table already exists
-- without the preferred_genres column.
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "preferred_genres" text[] DEFAULT '{}' NOT NULL;
