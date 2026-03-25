CREATE TABLE "algorithm_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"content_type" text NOT NULL,
	"ctr_response" real,
	"retention_response" real,
	"recommendation_rate" real,
	"algorithm_favor" real DEFAULT 0.5,
	"patterns" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cadence_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"optimal_frequency" real,
	"current_frequency" real,
	"audience_retention" real,
	"algorithm_score" real,
	"buffer_days" integer DEFAULT 0,
	"recommendations" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_timing_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"day_of_week" integer,
	"hour_of_day" integer,
	"timezone" text,
	"engagement_score" real DEFAULT 0,
	"views_multiplier" real DEFAULT 1,
	"sample_size" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "distribution_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"content_id" text,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"trust_budget_cost" real DEFAULT 0,
	"capability_probe_result" text,
	"policy_gate_result" text,
	"error_message" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "format_innovations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"format_name" text NOT NULL,
	"description" text,
	"adoption_stage" text DEFAULT 'emerging',
	"potential_score" real DEFAULT 0,
	"competitor_adoption" real DEFAULT 0,
	"recommended" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "niche_authority_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"niche" text NOT NULL,
	"platform" text NOT NULL,
	"authority_score" real DEFAULT 0,
	"content_count" integer DEFAULT 0,
	"audience_reach" integer DEFAULT 0,
	"competitor_rank" integer,
	"growth_trend" text DEFAULT 'stable',
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_dependency_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"dependency_score" real DEFAULT 0,
	"revenue_share" real DEFAULT 0,
	"audience_share" real DEFAULT 0,
	"content_share" real DEFAULT 0,
	"risk_level" text DEFAULT 'low',
	"migration_readiness" real DEFAULT 0,
	"recommendations" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_independence_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"overall_score" real DEFAULT 0,
	"single_platform_risk" real DEFAULT 0,
	"diversification_score" real DEFAULT 0,
	"data_sovereignty_score" real DEFAULT 0,
	"roadmap" jsonb DEFAULT '[]'::jsonb,
	"platform_breakdown" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trend_arbitrage_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"platform" text NOT NULL,
	"saturation_level" real DEFAULT 0,
	"opportunity_score" real DEFAULT 0,
	"window_remaining_hours" real,
	"competitor_count" integer DEFAULT 0,
	"recommended" boolean DEFAULT false,
	"acted_on" boolean DEFAULT false,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "ar_user_idx" ON "algorithm_relationships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ar_platform_idx" ON "algorithm_relationships" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ci_user_idx" ON "cadence_intelligence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ci_platform_idx" ON "cadence_intelligence" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "cti_user_idx" ON "content_timing_intelligence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cti_platform_idx" ON "content_timing_intelligence" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "dist_user_idx" ON "distribution_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dist_platform_idx" ON "distribution_events" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "dist_type_idx" ON "distribution_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "fi_user_idx" ON "format_innovations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fi_platform_idx" ON "format_innovations" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "nat_user_idx" ON "niche_authority_tracking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nat_niche_idx" ON "niche_authority_tracking" USING btree ("niche");--> statement-breakpoint
CREATE INDEX "nat_platform_idx" ON "niche_authority_tracking" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "pds_user_idx" ON "platform_dependency_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pds_platform_idx" ON "platform_dependency_scores" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "pis_user_idx" ON "platform_independence_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tao_user_idx" ON "trend_arbitrage_opportunities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tao_topic_idx" ON "trend_arbitrage_opportunities" USING btree ("topic");