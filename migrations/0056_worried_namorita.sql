CREATE TABLE "hypotheses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"statement" text NOT NULL,
	"domain" text NOT NULL,
	"rationale" text NOT NULL,
	"confidence" integer DEFAULT 30 NOT NULL,
	"evidence_for" integer DEFAULT 0 NOT NULL,
	"evidence_against" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'untested' NOT NULL,
	"experiment_id" integer,
	"tested_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_compliance_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text DEFAULT 'youtube' NOT NULL,
	"category" text NOT NULL,
	"rule" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"match_pattern" text,
	"source" text DEFAULT 'ai_seeded' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"last_triggered" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_performance_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"last_run_at" timestamp,
	"outputs_generated" integer DEFAULT 0 NOT NULL,
	"knowledge_entries_added" integer DEFAULT 0 NOT NULL,
	"quota_consumed" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"contribution_score" integer DEFAULT 50 NOT NULL,
	"critiqued_at" timestamp,
	"critique_summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"proposed_service" text NOT NULL,
	"scaffold" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence_sources" text[] DEFAULT '{}' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX "hyp_user_idx" ON "hypotheses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hyp_status_idx" ON "hypotheses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hyp_domain_idx" ON "hypotheses" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "compliance_rule_user_idx" ON "platform_compliance_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "compliance_rule_platform_idx" ON "platform_compliance_rules" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "compliance_rule_severity_idx" ON "platform_compliance_rules" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "compliance_rule_category_idx" ON "platform_compliance_rules" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "spm_service_uq" ON "service_performance_metrics" USING btree ("service");--> statement-breakpoint
CREATE INDEX "sp_user_idx" ON "service_proposals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sp_status_idx" ON "service_proposals" USING btree ("status");