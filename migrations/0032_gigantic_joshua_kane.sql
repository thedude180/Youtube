CREATE TABLE "intelligence_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"url" text,
	"score" real DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"processed" boolean DEFAULT false,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "is_user_idx" ON "intelligence_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "is_source_idx" ON "intelligence_signals" USING btree ("source");--> statement-breakpoint
CREATE INDEX "is_processed_idx" ON "intelligence_signals" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "is_created_idx" ON "intelligence_signals" USING btree ("created_at");