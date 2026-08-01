import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  db,
  partnerInvitesTable,
  partnerLinksTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

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
  // Short, URL-safe code: e.g. reel-a3f9k2
  return `reel-${randomBytes(4).toString("hex")}`;
}

/**
 * POST /partners/invite
 * Create (or return) an active invite code for the current user.
 */
router.post("/partners/invite", requireAuth, async (req: any, res): Promise<void> => {
  if (!requireRegistered(req, res)) return;

  const existing = await db
    .select()
    .from(partnerInvitesTable)
    .where(
      and(
        eq(partnerInvitesTable.creatorUserId, req.userId),
        isNull(partnerInvitesTable.redeemedAt),
        gt(partnerInvitesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existing[0]) {
    res.json({
      code: existing[0].code,
      expiresAt: existing[0].expiresAt.toISOString(),
      path: `/pair/${existing[0].code}`,
    });
    return;
  }

  const code = makeInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [invite] = await db
    .insert(partnerInvitesTable)
    .values({
      code,
      creatorUserId: req.userId,
      expiresAt,
    })
    .returning();

  res.status(201).json({
    code: invite.code,
    expiresAt: invite.expiresAt.toISOString(),
    path: `/pair/${invite.code}`,
  });
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
    // End any other active links for either user (one partner at a time).
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

  res.json({
    partner: {
      partnerLinkId: link.id,
      partnerUserId,
      status: link.status,
      createdAt: link.createdAt.toISOString(),
    },
  });
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
