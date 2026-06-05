CREATE TABLE "channel_performance_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_performance_memory_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "decision_journal" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"module" text NOT NULL,
	"user_id" text,
	"channel_id" text,
	"job_id" text,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb,
	"confidence" real,
	"expected_outcome" text,
	"action_taken" text,
	"result" text,
	"rollback_available" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "growth_experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text,
	"hypothesis" text NOT NULL,
	"target_metric" text NOT NULL,
	"target_video_id" text,
	"change_type" text NOT NULL,
	"change_original" text NOT NULL,
	"change_proposed" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"confidence_score" real DEFAULT 0,
	"result" text,
	"decision" text,
	"rollback_plan" text DEFAULT '',
	"status" text DEFAULT 'staged' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playlist_funnels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"game_name" text NOT NULL,
	"youtube_playlist_id" text NOT NULL,
	"funnel_type" text DEFAULT 'mixed' NOT NULL,
	"video_count" integer DEFAULT 0,
	"shorts_count" integer DEFAULT 0,
	"long_form_count" integer DEFAULT 0,
	"last_video_added_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "self_healing_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"severity" text NOT NULL,
	"error_code" text NOT NULL,
	"module" text NOT NULL,
	"action_taken" text NOT NULL,
	"confidence" real,
	"risk_level" text NOT NULL,
	"status" text NOT NULL,
	"result" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_next_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"short_youtube_id" text NOT NULL,
	"long_form_youtube_id" text,
	"game_name" text,
	"update_success" boolean DEFAULT false,
	"fail_reason" text,
	"linked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "yt_dlp_backoff" (
	"youtube_id" text PRIMARY KEY NOT NULL,
	"failure_type" text NOT NULL,
	"consecutive_fails" integer DEFAULT 1 NOT NULL,
	"retry_after" timestamp with time zone NOT NULL,
	"last_failure_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_vault_backups" ADD COLUMN "retry_after" timestamp;--> statement-breakpoint
ALTER TABLE "content_vault_backups" ADD COLUMN "resurrection_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "youtube_output_metrics" ADD COLUMN "hook_retention_pct" real;--> statement-breakpoint
ALTER TABLE "youtube_output_metrics" ADD COLUMN "thumbnail_style_tag" text;--> statement-breakpoint
ALTER TABLE "youtube_push_backlog" ADD COLUMN "retry_after" timestamp;--> statement-breakpoint
ALTER TABLE "youtube_push_backlog" ADD COLUMN "resurrection_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "playlist_funnels" ADD CONSTRAINT "playlist_funnels_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_next_links" ADD CONSTRAINT "watch_next_links_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cpm_user_idx" ON "channel_performance_memory" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dj_timestamp_idx" ON "decision_journal" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "dj_module_idx" ON "decision_journal" USING btree ("module");--> statement-breakpoint
CREATE INDEX "dj_user_idx" ON "decision_journal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dj_decision_idx" ON "decision_journal" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "ge_user_idx" ON "growth_experiments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ge_status_idx" ON "growth_experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ge_created_idx" ON "growth_experiments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pf_user_idx" ON "playlist_funnels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pf_game_idx" ON "playlist_funnels" USING btree ("game_name");--> statement-breakpoint
CREATE INDEX "pf_channel_idx" ON "playlist_funnels" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pf_user_game_idx" ON "playlist_funnels" USING btree ("user_id","game_name");--> statement-breakpoint
CREATE INDEX "sha_created_idx" ON "self_healing_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sha_module_idx" ON "self_healing_actions" USING btree ("module");--> statement-breakpoint
CREATE INDEX "sha_error_code_idx" ON "self_healing_actions" USING btree ("error_code");--> statement-breakpoint
CREATE INDEX "sha_status_idx" ON "self_healing_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wnl_user_idx" ON "watch_next_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wnl_short_idx" ON "watch_next_links" USING btree ("short_youtube_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wnl_short_user_idx" ON "watch_next_links" USING btree ("user_id","short_youtube_id");--> statement-breakpoint
CREATE INDEX "idx_yt_dlp_backoff_retry" ON "yt_dlp_backoff" USING btree ("retry_after");--> statement-breakpoint
CREATE INDEX "yom_hook_idx" ON "youtube_output_metrics" USING btree ("hook_retention_pct");--> statement-breakpoint
CREATE INDEX "yom_thumb_style_idx" ON "youtube_output_metrics" USING btree ("thumbnail_style_tag");