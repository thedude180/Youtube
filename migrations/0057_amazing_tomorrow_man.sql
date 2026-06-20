CREATE TABLE "asi_cycle_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" text NOT NULL,
	"cycle_type" text NOT NULL,
	"metrics_snapshot" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asi_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_tier" text NOT NULL,
	"to_tier" text NOT NULL,
	"signal_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asi_strategy" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"active_strategy" jsonb DEFAULT '{}'::jsonb,
	"last_synthesized_at" timestamp DEFAULT now() NOT NULL,
	"confidence_score" integer DEFAULT 70 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "asi_strategy_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE INDEX "asi_rep_user_idx" ON "asi_cycle_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asi_rep_tier_idx" ON "asi_cycle_reports" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "asi_rep_created_idx" ON "asi_cycle_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "asi_sig_to_idx" ON "asi_signals" USING btree ("to_tier");--> statement-breakpoint
CREATE INDEX "asi_sig_proc_idx" ON "asi_signals" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "asi_strat_user_idx" ON "asi_strategy" USING btree ("user_id");