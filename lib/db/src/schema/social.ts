import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Active or past partner pairing between two users. */
export const partnerLinksTable = pgTable(
  "partner_links",
  {
    id: serial("id").primaryKey(),
    /** Canonically min(userA, userB) for uniqueness. */
    userLowId: text("user_low_id").notNull(),
    /** Canonically max(userA, userB). */
    userHighId: text("user_high_id").notNull(),
    status: text("status").notNull().default("active"), // active | ended
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("partner_links_pair_unique")
      .on(table.userLowId, table.userHighId)
      .where(sql`${table.status} = 'active'`),
    index("partner_links_low_idx").on(table.userLowId),
    index("partner_links_high_idx").on(table.userHighId),
  ],
);

/**
 * Named people you've invited for Together nights.
 * Display name is typed by the inviter (WhatsApp can't tell us the contact).
 */
export const partnerContactsTable = pgTable(
  "partner_contacts",
  {
    id: serial("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    displayName: text("display_name").notNull(),
    /** Set when an invite to this contact is redeemed. */
    partnerUserId: text("partner_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("partner_contacts_owner_idx").on(table.ownerUserId),
    index("partner_contacts_partner_idx").on(table.partnerUserId),
  ],
);

/** One-time invite codes to form a partner link. */
export const partnerInvitesTable = pgTable(
  "partner_invites",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    creatorUserId: text("creator_user_id").notNull(),
    /** Optional link to a named contact for invite history. */
    contactId: integer("contact_id"),
    /** Nickname snapshot at invite time (e.g. “Priya”). */
    recipientName: text("recipient_name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedByUserId: text("redeemed_by_user_id"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("partner_invites_creator_idx").on(table.creatorUserId),
    index("partner_invites_contact_idx").on(table.contactId),
  ],
);

/** Shared dual-swipe deck session between partners. */
export const matchSessionsTable = pgTable(
  "match_sessions",
  {
    id: serial("id").primaryKey(),
    partnerLinkId: integer("partner_link_id").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    status: text("status").notNull().default("active"), // active | completed | cancelled
    /** Ordered deck snapshot: SwipeCandidate[] with source buckets. */
    deck: jsonb("deck").notNull().$type<Array<Record<string, unknown>>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("match_sessions_partner_idx").on(table.partnerLinkId),
    index("match_sessions_creator_idx").on(table.createdByUserId),
  ],
);

/** Per-user swipe within a match session. */
export const matchSessionSwipesTable = pgTable(
  "match_session_swipes",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    userId: text("user_id").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    /** like | pass */
    direction: text("direction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_swipes_unique").on(table.sessionId, table.userId, table.tmdbId),
    index("match_swipes_session_idx").on(table.sessionId),
  ],
);
