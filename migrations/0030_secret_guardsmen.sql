CREATE INDEX "ai_results_created_at_idx" ON "ai_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audience_activity_patterns_user_platform_idx" ON "audience_activity_patterns" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "vault_user_youtube_idx" ON "content_vault_backups" USING btree ("user_id","youtube_id");--> statement-breakpoint
CREATE INDEX "vault_status_idx" ON "content_vault_backups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cron_jobs_enabled_idx" ON "cron_jobs" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_created_at_idx" ON "webhook_events" USING btree ("processed","created_at");