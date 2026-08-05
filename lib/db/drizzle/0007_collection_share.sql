ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'private' NOT NULL;
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "share_token" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "collections_share_token_unique" ON "collections" ("share_token");
