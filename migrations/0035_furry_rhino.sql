CREATE TABLE "back_catalog_derivatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"back_catalog_video_id" integer,
	"source_youtube_id" text,
	"derivative_type" text NOT NULL,
	"transformation_type" text NOT NULL,
	"derivative_youtube_id" text,
	"queue_item_id" integer,
	"before_views" integer,
	"after_views_24h" integer,
	"after_views_7d" integer,
	"after_watch_time_7d" real,
	"traffic_from_shorts" integer,
	"subscribers_gained" integer,
	"revenue_eligible_estimate" real,
	"performance_score" real,
	"measured_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "back_catalog_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" integer,
	"local_video_id" integer,
	"youtube_video_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text,
	"tags" text[],
	"thumbnail_url" text,
	"duration_sec" integer DEFAULT 0,
	"published_at" timestamp,
	"privacy_status" text,
	"view_count" integer DEFAULT 0,
	"like_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"category_id" text,
	"game_name" text,
	"is_vod" boolean DEFAULT false,
	"is_short" boolean DEFAULT false,
	"is_long_form" boolean DEFAULT false,
	"is_over_60_min" boolean DEFAULT false,
	"mined_for_shorts" boolean DEFAULT false,
	"mined_for_long_form" boolean DEFAULT false,
	"shorts_queued_count" integer DEFAULT 0,
	"long_form_queued_count" integer DEFAULT 0,
	"metadata_updates_queued" integer DEFAULT 0,
	"metadata_opportunity_score" real,
	"thumbnail_opportunity_score" real,
	"shorts_opportunity_score" real,
	"long_form_opportunity_score" real,
	"monetization_opportunity_score" real,
	"total_revival_score" real,
	"monetization_status" text,
	"last_optimized_at" timestamp,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "back_catalog_derivatives" ADD CONSTRAINT "back_catalog_derivatives_back_catalog_video_id_back_catalog_videos_id_fk" FOREIGN KEY ("back_catalog_video_id") REFERENCES "public"."back_catalog_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "back_catalog_videos" ADD CONSTRAINT "back_catalog_videos_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "back_catalog_videos" ADD CONSTRAINT "back_catalog_videos_local_video_id_videos_id_fk" FOREIGN KEY ("local_video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bcd_user_idx" ON "back_catalog_derivatives" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bcd_source_idx" ON "back_catalog_derivatives" USING btree ("back_catalog_video_id");--> statement-breakpoint
CREATE INDEX "bcd_type_idx" ON "back_catalog_derivatives" USING btree ("derivative_type");--> statement-breakpoint
CREATE INDEX "bcd_yt_id_idx" ON "back_catalog_derivatives" USING btree ("derivative_youtube_id");--> statement-breakpoint
CREATE INDEX "bcv_user_idx" ON "back_catalog_videos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bcv_yt_id_idx" ON "back_catalog_videos" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "bcv_user_yt_idx" ON "back_catalog_videos" USING btree ("user_id","youtube_video_id");--> statement-breakpoint
CREATE INDEX "bcv_revival_score_idx" ON "back_catalog_videos" USING btree ("total_revival_score");--> statement-breakpoint
CREATE INDEX "bcv_channel_idx" ON "back_catalog_videos" USING btree ("channel_id");