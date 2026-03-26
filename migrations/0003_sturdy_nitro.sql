CREATE TABLE "compliance_drift_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"rule_category" text NOT NULL,
	"drift_type" text NOT NULL,
	"previous_hash" text,
	"current_hash" text,
	"changes_detected" jsonb DEFAULT '[]'::jsonb,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"resolved_at" timestamp,
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_provenance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content_id" integer,
	"content_type" text NOT NULL,
	"asset_name" text NOT NULL,
	"origin_type" text NOT NULL,
	"source" text,
	"license_type" text,
	"license_expiry" timestamp,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"trust_score" integer DEFAULT 50,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_credibility_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"overall_score" integer DEFAULT 50 NOT NULL,
	"compliance_rate" integer DEFAULT 100,
	"strike_count" integer DEFAULT 0,
	"warning_count" integer DEFAULT 0,
	"resolved_dispute_count" integer DEFAULT 0,
	"disclosure_compliance_rate" integer DEFAULT 100,
	"factors" jsonb DEFAULT '{}'::jsonb,
	"last_calculated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "policy_pack_baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"policy_hash" text NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "policy_pack_baselines_platform_unique" UNIQUE("platform")
);
--> statement-breakpoint
CREATE INDEX "compliance_drift_platform_idx" ON "compliance_drift_events" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "compliance_drift_status_idx" ON "compliance_drift_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_provenance_user_idx" ON "content_provenance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_provenance_origin_idx" ON "content_provenance" USING btree ("origin_type");--> statement-breakpoint
CREATE INDEX "creator_credibility_user_idx" ON "creator_credibility_scores" USING btree ("user_id");