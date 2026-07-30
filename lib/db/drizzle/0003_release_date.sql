-- Full release day for upcoming / looking-forward reminders.
ALTER TABLE "movies" ADD COLUMN IF NOT EXISTS "release_date" text;
