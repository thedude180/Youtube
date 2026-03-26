CREATE TABLE "metric_rollups" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_name" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"sum" real DEFAULT 0 NOT NULL,
	"avg" real DEFAULT 0 NOT NULL,
	"min" real DEFAULT 0 NOT NULL,
	"max" real DEFAULT 0 NOT NULL,
	"unit" text NOT NULL,
	"tags" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "mr_metric_idx" ON "metric_rollups" USING btree ("metric_name");--> statement-breakpoint
CREATE INDEX "mr_period_idx" ON "metric_rollups" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "mr_metric_period_idx" ON "metric_rollups" USING btree ("metric_name","period_start");