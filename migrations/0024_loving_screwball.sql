CREATE TABLE "platform_feature_eligibility" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"feature_id" text NOT NULL,
	"feature_name" text NOT NULL,
	"status" text DEFAULT 'checking' NOT NULL,
	"requires_application" boolean DEFAULT true NOT NULL,
	"application_url" text,
	"qualified_at" timestamp,
	"notified_at" timestamp,
	"applied_at" timestamp,
	"activated_at" timestamp,
	"dismissed_at" timestamp,
	"thresholds_met" jsonb,
	"pipeline_effects" jsonb,
	"last_checked_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pfe_user_platform_feature_idx" ON "platform_feature_eligibility" USING btree ("user_id","platform","feature_id");