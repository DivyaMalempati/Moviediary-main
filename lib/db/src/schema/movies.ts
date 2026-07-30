import {
  pgTable,
  pgEnum,
  text,
  serial,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Enums ─────────────────────────────────────────────────────────────────
// Using real Postgres enums instead of free-text columns catches typos/bad
// values at the DB layer instead of silently corrupting stats later.

export const movieStatusEnum = pgEnum("movie_status", ["watched", "watchlist"]);

export const movieRatingEnum = pgEnum("movie_rating", [
  "loved",
  "great",
  "very_good",
  "good",
  "ok",
  "avg",
  "meh",
]);

export const mediaTypeEnum = pgEnum("media_type", ["movie", "tv"]);

// ── Table ─────────────────────────────────────────────────────────────────

export const moviesTable = pgTable(
  "movies",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),

    status: movieStatusEnum("status").notNull(),
    rating: movieRatingEnum("rating"),
    mediaType: mediaTypeEnum("media_type").notNull().default("movie"),

    notes: text("notes"),
    tmdbId: integer("tmdb_id"),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    releaseYear: integer("release_year"),
    // Full theatrical/digital release day (YYYY-MM-DD) for upcoming reminders.
    releaseDate: text("release_date"),
    originalLanguage: text("original_language"),
    genres: text("genres").array(),
    overview: text("overview"),

    // Kept as "last watched" convenience column (updated on each rewatch).
    // rewatchDates holds optional dated rewatch entries; undated rewatches
    // only increment rewatchCount.
    watchedAt: timestamp("watched_at", { withTimezone: true }),

    // Number of rewatches after the first watch (0 = watched once).
    rewatchCount: integer("rewatch_count").notNull().default(0),

    // Optional dates for each rewatch (ISO timestamps). Length may be less
    // than rewatchCount when some rewatches were logged without a date.
    rewatchDates: timestamp("rewatch_dates", { withTimezone: true })
      .array()
      .notNull()
      .default(sql`'{}'::timestamptz[]`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // Soft delete — recoverable instead of gone forever on a mis-tap.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Prevents the same TMDB title being added twice by the same user.
    // Partial index: only enforced when tmdbId is set (manual entries with
    // no tmdbId are exempt since there's nothing to de-dupe against).
    uniqueIndex("movies_user_tmdb_media_unique")
      .on(table.userId, table.tmdbId, table.mediaType)
      .where(sql`${table.tmdbId} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    // Speeds up the most common query pattern: "this user's watched/watchlist list"
    index("movies_user_status_idx").on(table.userId, table.status),

    // Speeds up genre-pill filtering (array containment queries).
    index("movies_genres_gin_idx").using("gin", table.genres),
  ],
);

// ── Zod insert schema ────────────────────────────────────────────────────

export const insertMovieSchema = createInsertSchema(moviesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type Movie = typeof moviesTable.$inferSelect;
