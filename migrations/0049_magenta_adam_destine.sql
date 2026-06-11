CREATE TABLE "tracked_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"content_type" text DEFAULT 'short' NOT NULL,
	"game_name" text,
	"title" text,
	"published_at" timestamp,
	"added_at" timestamp DEFAULT now(),
	"last_snapshot_at" timestamp,
	"is_active" boolean DEFAULT true,
	"source_queue_item_id" integer
);
--> statement-breakpoint
CREATE TABLE "video_momentum_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"content_type" text DEFAULT 'short' NOT NULL,
	"game_name" text,
	"title" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"velocity_per_hour" real DEFAULT 0,
	"momentum_score" real DEFAULT 0,
	"is_gaining_steam" boolean DEFAULT false,
	"hours_since_publish" real,
	"published_at" timestamp,
	"snapshot_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "tv_user_idx" ON "tracked_videos" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_video_unique" ON "tracked_videos" USING btree ("user_id","youtube_video_id");--> statement-breakpoint
CREATE INDEX "tv_active_idx" ON "tracked_videos" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "vms_user_idx" ON "video_momentum_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vms_video_idx" ON "video_momentum_snapshots" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "vms_steam_idx" ON "video_momentum_snapshots" USING btree ("is_gaining_steam");--> statement-breakpoint
CREATE INDEX "vms_score_idx" ON "video_momentum_snapshots" USING btree ("momentum_score");--> statement-breakpoint
CREATE INDEX "vms_snap_idx" ON "video_momentum_snapshots" USING btree ("snapshot_at");