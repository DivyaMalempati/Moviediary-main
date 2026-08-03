-- Preserve the original watch day separately from last-watched / rewatch dates.
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "first_watched_at" timestamp with time zone;
--> statement-breakpoint
-- Never rewatched: first watch is the current watched_at value.
UPDATE "movies"
SET "first_watched_at" = "watched_at"
WHERE "first_watched_at" IS NULL
  AND "rewatch_count" = 0
  AND "watched_at" IS NOT NULL;
