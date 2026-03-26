CREATE TABLE "financial_audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_snapshot" jsonb DEFAULT '{}'::jsonb,
	"after_snapshot" jsonb DEFAULT '{}'::jsonb,
	"change_amount" real,
	"currency" text DEFAULT 'USD',
	"checksum" text NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "fat_user_idx" ON "financial_audit_trail" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fat_entity_idx" ON "financial_audit_trail" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "fat_action_idx" ON "financial_audit_trail" USING btree ("action");--> statement-breakpoint
CREATE INDEX "fat_created_idx" ON "financial_audit_trail" USING btree ("created_at");