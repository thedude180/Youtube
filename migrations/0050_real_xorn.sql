CREATE TABLE "shadow_channel_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"subscriber_count" integer,
	"total_video_count" integer,
	"total_views" integer DEFAULT 0 NOT NULL,
	"total_likes" integer DEFAULT 0 NOT NULL,
	"total_comments" integer DEFAULT 0 NOT NULL,
	"new_videos_published" integer DEFAULT 0 NOT NULL,
	"avg_engagement_rate" real,
	"total_watch_time_minutes" real,
	"total_impressions" integer,
	"avg_ctr" real,
	"subscribers_gained_today" integer,
	"estimated_daily_revenue" real,
	"source" text DEFAULT 'innertube' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "shadow_video_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"content_type" text DEFAULT 'short' NOT NULL,
	"game_name" text,
	"title" text,
	"published_at" timestamp,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"velocity_24h" integer DEFAULT 0 NOT NULL,
	"velocity_7d" integer DEFAULT 0 NOT NULL,
	"velocity_28d" integer DEFAULT 0 NOT NULL,
	"velocity_per_hour" real DEFAULT 0 NOT NULL,
	"engagement_rate" real DEFAULT 0 NOT NULL,
	"watch_time_minutes" real,
	"average_view_duration_sec" real,
	"average_view_percent" real,
	"impressions" integer,
	"impressions_ctr" real,
	"subscribers_gained" integer,
	"shares" integer,
	"estimated_revenue" real,
	"traffic_sources" jsonb,
	"verified_views" integer,
	"verified_watch_time" real,
	"verified_ctr" real,
	"discrepancy_pct" real,
	"public_data_at" timestamp,
	"studio_data_at" timestamp,
	"analytics_verified_at" timestamp,
	"performance_score" real,
	"momentum_score" real,
	"measured_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX "sca_user_idx" ON "shadow_channel_analytics" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sca_user_date_uq" ON "shadow_channel_analytics" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "sva_user_idx" ON "shadow_video_analytics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sva_video_idx" ON "shadow_video_analytics" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "sva_measured_idx" ON "shadow_video_analytics" USING btree ("measured_at");--> statement-breakpoint
CREATE INDEX "sva_perf_idx" ON "shadow_video_analytics" USING btree ("performance_score");--> statement-breakpoint
CREATE UNIQUE INDEX "sva_user_video_uq" ON "shadow_video_analytics" USING btree ("user_id","youtube_video_id");