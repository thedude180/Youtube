CREATE TABLE "channel_success_dna" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern" text NOT NULL,
	"confidence_score" real DEFAULT 0.5 NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"avg_performance_score" real DEFAULT 0 NOT NULL,
	"last_updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "csd_user_pattern_uniq" ON "channel_success_dna" USING btree ("user_id","pattern_type","pattern");--> statement-breakpoint
CREATE INDEX "csd_user_type_idx" ON "channel_success_dna" USING btree ("user_id","pattern_type");--> statement-breakpoint
CREATE INDEX "csd_confidence_idx" ON "channel_success_dna" USING btree ("confidence_score");