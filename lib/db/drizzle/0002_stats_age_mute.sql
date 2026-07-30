-- Age filter + muted genres for recommendation controls.
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "max_certification" text;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "muted_genres" text[] DEFAULT '{}' NOT NULL;
