import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userPreferencesTable = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  preferredLanguages: text("preferred_languages").array().notNull().default([]),
  preferredGenres: text("preferred_genres").array().notNull().default([]),
  // Set the first time a user ever saves preferences (onboarding, or the
  // settings-gear modal for existing users who never saw onboarding). Used
  // to decide whether to show the onboarding step before swipe.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
