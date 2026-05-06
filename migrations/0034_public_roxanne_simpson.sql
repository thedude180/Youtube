CREATE TABLE "learning_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"source_agent" text,
	"data" jsonb DEFAULT '{}'::jsonb,
	"outcome" text,
	"performance_delta" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "livestream_learning_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" integer,
	"event_type" text NOT NULL,
	"message_id" integer,
	"outcome" text,
	"chat_style" text,
	"response_pattern" text,
	"viewer_retained" boolean,
	"data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "longform_extraction_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_video_id" integer NOT NULL,
	"start_sec" integer NOT NULL,
	"end_sec" integer NOT NULL,
	"duration_sec" integer NOT NULL,
	"title" text,
	"description" text,
	"tags" text[] DEFAULT '{}',
	"game_name" text,
	"quality_score" integer DEFAULT 5,
	"retention_score" integer DEFAULT 5,
	"hook_description" text,
	"ending_type" text,
	"content_category" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"queue_item_id" integer,
	"youtube_video_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "youtube_output_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"source_video_id" integer,
	"content_type" text NOT NULL,
	"duration_sec" integer,
	"duration_bucket" text,
	"game_name" text,
	"posting_window" text,
	"impressions" integer DEFAULT 0,
	"ctr" real DEFAULT 0,
	"views" integer DEFAULT 0,
	"average_view_duration_sec" integer DEFAULT 0,
	"average_view_percent" real DEFAULT 0,
	"watch_time_minutes" real DEFAULT 0,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"subscribers_gained" integer DEFAULT 0,
	"retention_drop_off_sec" integer,
	"first_24h_views" integer DEFAULT 0,
	"first_72h_views" integer DEFAULT 0,
	"seven_day_views" integer DEFAULT 0,
	"performance_score" real DEFAULT 0,
	"measured_at" timestamp,
	"published_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "longform_extraction_segments" ADD CONSTRAINT "longform_extraction_segments_source_video_id_videos_id_fk" FOREIGN KEY ("source_video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "le_user_idx" ON "learning_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "le_type_idx" ON "learning_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "le_created_idx" ON "learning_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lle_user_idx" ON "livestream_learning_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lle_stream_idx" ON "livestream_learning_events" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "lle_type_idx" ON "livestream_learning_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "lfe_user_idx" ON "longform_extraction_segments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lfe_source_idx" ON "longform_extraction_segments" USING btree ("source_video_id");--> statement-breakpoint
CREATE INDEX "lfe_status_idx" ON "longform_extraction_segments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "yom_user_idx" ON "youtube_output_metrics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "yom_type_idx" ON "youtube_output_metrics" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "yom_bucket_idx" ON "youtube_output_metrics" USING btree ("duration_bucket");--> statement-breakpoint
CREATE INDEX "yom_game_idx" ON "youtube_output_metrics" USING btree ("game_name");--> statement-breakpoint
CREATE INDEX "yom_ytid_idx" ON "youtube_output_metrics" USING btree ("youtube_video_id");