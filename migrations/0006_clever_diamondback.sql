CREATE TABLE "channel_immune_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"threat_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"indicators" jsonb DEFAULT '{}'::jsonb,
	"defensive_action" text,
	"status" text DEFAULT 'detected' NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_trust_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"value" real DEFAULT 0 NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "governance_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"domain" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"outcome" text DEFAULT 'success' NOT NULL,
	"performed_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "cie_user_idx" ON "channel_immune_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cie_threat_idx" ON "channel_immune_events" USING btree ("threat_type");--> statement-breakpoint
CREATE INDEX "cie_status_idx" ON "channel_immune_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cie_created_idx" ON "channel_immune_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cts_user_idx" ON "community_trust_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cts_type_idx" ON "community_trust_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "cts_created_idx" ON "community_trust_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gov_audit_user_idx" ON "governance_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gov_audit_action_idx" ON "governance_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "gov_audit_domain_idx" ON "governance_audit_logs" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "gov_audit_created_idx" ON "governance_audit_logs" USING btree ("created_at");