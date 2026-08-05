import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moviesTable } from "./movies";

// Rule shape stored in JSONB: array of SmartRule objects
// { field: "genre"|"language"|"status"|"rating"|"yearFrom"|"yearTo", value: string }
export interface SmartRule {
  field: "genre" | "language" | "status" | "rating" | "yearFrom" | "yearTo";
  value: string;
}

export const collectionsTable = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  rules: jsonb("rules").$type<SmartRule[] | null>(),
  /** private = owner only; public = viewable via shareToken link. */
  visibility: text("visibility").notNull().default("private"),
  /** Opaque share token for /c/:token. Null when private. */
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectionMoviesTable = pgTable("collection_movies", {
  collectionId: integer("collection_id").notNull().references(() => collectionsTable.id, { onDelete: "cascade" }),
  movieId: integer("movie_id").notNull().references(() => moviesTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Collection = typeof collectionsTable.$inferSelect;
export type CollectionMovie = typeof collectionMoviesTable.$inferSelect;
