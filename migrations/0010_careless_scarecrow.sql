DROP INDEX "mr_metric_period_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "mr_metric_period_unique" ON "metric_rollups" USING btree ("metric_name","period_start","period_end");