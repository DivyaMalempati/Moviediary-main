import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  partnerContactsTable,
  partnerInvitesTable,
  partnerLinksTable,
  matchSessionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { ensureSchema } from "../lib/ensure-schema.js";

const router: IRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Together pairs are durable — guests must sign in (no guest_* ritual links). */
function requireRegistered(req: any, res: any): boolean {
  const userId = req.userId as string;
  if (!userId || userId.startsWith("guest_")) {
    res.status(401).json({ error: "Sign in to link a partner" });
    return false;
  }
  return true;
}

function makeInviteCode(): string {
  return `reel-${randomBytes(4).toString("hex")}`;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * POST /partners/invite  { recipientName }
 * Create an invite for a named person (nickname). Always mints a fresh code
 * so each person you invite can be tracked separately.
 */
async function createNamedInvite(userId: string, rawName: string) {
  // Reuse contact with same display name (case-insensitive) for this owner.
  const [existingContact] = await db
    .select()
    .from(partnerContactsTable)
    .where(
      and(
        eq(partnerContactsTable.ownerUserId, userId),
        sql`lower(${partnerContactsTable.displayName}) = ${rawName.toLowerCase()}`,
      ),
    )
    .limit(1);

  let contact = existingContact;
  if (!contact) {
    const [created] = await db
      .insert(partnerContactsTable)
      .values({
        ownerUserId: userId,
        displayName: rawName,
      })
      .returning();
    contact = created;
  } else {
    await db
      .update(partnerContactsTable)
      .set({ displayName: rawName, updatedAt: new Date() })
      .where(eq(partnerContactsTable.id, contact.id));
  }

  const code = makeInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [invite] = await db
    .insert(partnerInvitesTable)
    .values({
      code,
      creatorUserId: userId,
      contactId: contact.id,
      recipientName: rawName,
      expiresAt,
    })
    .returning();

  return {
    code: invite.code,
    expiresAt: invite.expiresAt.toISOString(),
    path: `/pair/${invite.code}`,
    recipientName: rawName,
    contactId: contact.id,
  };
}

router.post("/partners/invite", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  const rawName =
    typeof req.body?.recipientName === "string" ? normalizeName(req.body.recipientName) : "";
  if (!rawName || rawName.length < 1) {
    res.status(400).json({ error: "Who are you inviting? Add a name (e.g. Priya)." });
    return;
  }
  if (rawName.length > 60) {
    res.status(400).json({ error: "Name is too long" });
    return;
  }

  try {
    res.status(201).json(await createNamedInvite(req.userId, rawName));
  } catch (err) {
    // Self-heal after deploys that shipped named-invite code before drizzle push.
    try {
      await ensureSchema();
      res.status(201).json(await createNamedInvite(req.userId, rawName));
    } catch (retryErr) {
      console.error("[partners] invite failed", retryErr ?? err);
      res.status(500).json({ error: "Couldn’t create invite. Try again after a refresh." });
    }
  }
});

/**
 * POST /partners/join  { code }
 * Redeem an invite and create an active partner_links row.
 */
router.post("/partners/join", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  const code = typeof req.body?.code === "string" ? req.body.code.trim().toLowerCase() : "";
  if (!code) {
    res.status(400).json({ error: "Invite code required" });
    return;
  }

  const [invite] = await db
    .select()
    .from(partnerInvitesTable)
    .where(eq(partnerInvitesTable.code, code))
    .limit(1);

  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }
  if (invite.redeemedAt) {
    res.status(409).json({ error: "Invite already used" });
    return;
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "Invite expired" });
    return;
  }
  if (invite.creatorUserId === req.userId) {
    res.status(400).json({ error: "You can’t redeem your own invite" });
    return;
  }

  const [low, high] = canonicalPair(invite.creatorUserId, req.userId);

  const [existingLink] = await db
    .select()
    .from(partnerLinksTable)
    .where(
      and(
        eq(partnerLinksTable.userLowId, low),
        eq(partnerLinksTable.userHighId, high),
        eq(partnerLinksTable.status, "active"),
      ),
    )
    .limit(1);

  let link = existingLink;
  if (!link) {
    await db
      .update(partnerLinksTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(
        and(
          eq(partnerLinksTable.status, "active"),
          or(
            eq(partnerLinksTable.userLowId, req.userId),
            eq(partnerLinksTable.userHighId, req.userId),
            eq(partnerLinksTable.userLowId, invite.creatorUserId),
            eq(partnerLinksTable.userHighId, invite.creatorUserId),
          ),
        ),
      );

    const [created] = await db
      .insert(partnerLinksTable)
      .values({
        userLowId: low,
        userHighId: high,
        status: "active",
      })
      .returning();
    link = created;
  }

  await db
    .update(partnerInvitesTable)
    .set({
      redeemedByUserId: req.userId,
      redeemedAt: new Date(),
    })
    .where(eq(partnerInvitesTable.id, invite.id));

  if (invite.contactId) {
    await db
      .update(partnerContactsTable)
      .set({
        partnerUserId: req.userId,
        updatedAt: new Date(),
      })
      .where(eq(partnerContactsTable.id, invite.contactId));
  }

  res.json({
    partnerLinkId: link.id,
    partnerUserId: invite.creatorUserId,
    status: link.status,
    createdAt: link.createdAt.toISOString(),
  });
});

/** GET /partners — current active partner link (if any). */
router.get("/partners", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  const [link] = await db
    .select()
    .from(partnerLinksTable)
    .where(
      and(
        eq(partnerLinksTable.status, "active"),
        or(
          eq(partnerLinksTable.userLowId, req.userId),
          eq(partnerLinksTable.userHighId, req.userId),
        ),
      ),
    )
    .limit(1);

  if (!link) {
    res.json({ partner: null });
    return;
  }

  const partnerUserId =
    link.userLowId === req.userId ? link.userHighId : link.userLowId;

  const [contact] = await db
    .select()
    .from(partnerContactsTable)
    .where(
      and(
        eq(partnerContactsTable.ownerUserId, req.userId),
        eq(partnerContactsTable.partnerUserId, partnerUserId),
      ),
    )
    .limit(1);

  res.json({
    partner: {
      partnerLinkId: link.id,
      partnerUserId,
      displayName: contact?.displayName ?? null,
      status: link.status,
      createdAt: link.createdAt.toISOString(),
    },
  });
});

/**
 * GET /partners/contacts
 * People you've invited: nickname → pending invite / paired → swipe sessions.
 */
router.get("/partners/contacts", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  let contacts;
  try {
    contacts = await db
      .select()
      .from(partnerContactsTable)
      .where(eq(partnerContactsTable.ownerUserId, req.userId))
      .orderBy(desc(partnerContactsTable.updatedAt));
  } catch (err) {
    try {
      await ensureSchema();
      contacts = await db
        .select()
        .from(partnerContactsTable)
        .where(eq(partnerContactsTable.ownerUserId, req.userId))
        .orderBy(desc(partnerContactsTable.updatedAt));
    } catch (retryErr) {
      console.error("[partners] contacts failed", retryErr ?? err);
      res.status(500).json({ error: "Couldn’t load invites" });
      return;
    }
  }

  const out = [];
  for (const c of contacts) {
    const [pendingInvite] = await db
      .select()
      .from(partnerInvitesTable)
      .where(
        and(
          eq(partnerInvitesTable.contactId, c.id),
          isNull(partnerInvitesTable.redeemedAt),
          gt(partnerInvitesTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(partnerInvitesTable.createdAt))
      .limit(1);

    let sessions: Array<{
      id: number;
      status: string;
      deckSize: number;
      createdAt: string;
      path: string;
    }> = [];

    if (c.partnerUserId) {
      const [low, high] = canonicalPair(req.userId, c.partnerUserId);
      const links = await db
        .select()
        .from(partnerLinksTable)
        .where(
          and(
            eq(partnerLinksTable.userLowId, low),
            eq(partnerLinksTable.userHighId, high),
          ),
        );

      if (links.length) {
        const linkIds = links.map((l) => l.id);
        const rows = await db
          .select()
          .from(matchSessionsTable)
          .where(inArray(matchSessionsTable.partnerLinkId, linkIds))
          .orderBy(desc(matchSessionsTable.createdAt))
          .limit(20);

        sessions = rows.map((s) => ({
          id: s.id,
          status: s.status,
          deckSize: Array.isArray(s.deck) ? s.deck.length : 0,
          createdAt: s.createdAt.toISOString(),
          path: `/match/${s.id}`,
        }));
      }
    }

    const status = c.partnerUserId
      ? "paired"
      : pendingInvite
        ? "pending"
        : "expired";

    out.push({
      id: c.id,
      displayName: c.displayName,
      partnerUserId: c.partnerUserId,
      status,
      pendingInvite: pendingInvite
        ? {
            code: pendingInvite.code,
            expiresAt: pendingInvite.expiresAt.toISOString(),
            path: `/pair/${pendingInvite.code}`,
          }
        : null,
      sessions,
      updatedAt: c.updatedAt.toISOString(),
    });
  }

  res.json({ contacts: out });
});

/** DELETE /partners — end the active partner link. */
router.delete("/partners", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  const [link] = await db
    .select()
    .from(partnerLinksTable)
    .where(
      and(
        eq(partnerLinksTable.status, "active"),
        or(
          eq(partnerLinksTable.userLowId, req.userId),
          eq(partnerLinksTable.userHighId, req.userId),
        ),
      ),
    )
    .limit(1);

  if (!link) {
    res.status(404).json({ error: "No active partner" });
    return;
  }

  await db
    .update(partnerLinksTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(partnerLinksTable.id, link.id));

  res.sendStatus(204);
});

export default router;
