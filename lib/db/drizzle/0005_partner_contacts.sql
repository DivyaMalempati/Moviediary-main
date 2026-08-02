-- Named Together invites: contacts + invite metadata.
CREATE TABLE IF NOT EXISTS "partner_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"partner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_contacts_owner_idx" ON "partner_contacts" ("owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_contacts_partner_idx" ON "partner_contacts" ("partner_user_id");
--> statement-breakpoint
ALTER TABLE "partner_invites" ADD COLUMN IF NOT EXISTS "contact_id" integer;
--> statement-breakpoint
ALTER TABLE "partner_invites" ADD COLUMN IF NOT EXISTS "recipient_name" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_invites_contact_idx" ON "partner_invites" ("contact_id");
