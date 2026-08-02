-- Persist "Not interested" film ids for Discover + Swipe.
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "dismissed_tmdb_ids" integer[] DEFAULT '{}' NOT NULL;
