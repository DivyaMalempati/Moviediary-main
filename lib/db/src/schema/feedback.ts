import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

/** User feature requests / diary wishlist notes. */
export const featureFeedbackTable = pgTable(
  "feature_feedback",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Where they submitted from: prompt | profile */
    source: text("source").notNull().default("profile"),
    /** Optional short category chip. */
    category: text("category"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("feature_feedback_user_idx").on(table.userId),
    index("feature_feedback_created_idx").on(table.createdAt),
  ],
);
