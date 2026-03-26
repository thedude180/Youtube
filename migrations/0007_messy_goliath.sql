CREATE TABLE "licensing_exchange_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"asset_type" text NOT NULL,
	"asset_id" text NOT NULL,
	"title" text NOT NULL,
	"licensing_status" text DEFAULT 'unlicensed' NOT NULL,
	"rights_verified" boolean DEFAULT false NOT NULL,
	"readiness_score" real DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "narrative_promises" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"promise_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"deadline" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"delivery_progress" real DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signal_contradictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"domain" text NOT NULL,
	"signal_a_id" integer NOT NULL,
	"signal_b_id" integer NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"resolution" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "lea_user_idx" ON "licensing_exchange_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lea_status_idx" ON "licensing_exchange_assets" USING btree ("licensing_status");--> statement-breakpoint
CREATE INDEX "lea_asset_idx" ON "licensing_exchange_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "np_user_idx" ON "narrative_promises" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "np_status_idx" ON "narrative_promises" USING btree ("status");--> statement-breakpoint
CREATE INDEX "np_deadline_idx" ON "narrative_promises" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "sc_user_idx" ON "signal_contradictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sc_domain_idx" ON "signal_contradictions" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "sc_status_idx" ON "signal_contradictions" USING btree ("status");