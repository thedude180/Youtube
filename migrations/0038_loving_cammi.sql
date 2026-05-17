ALTER TABLE "back_catalog_videos" ALTER COLUMN "view_count" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "back_catalog_videos" ALTER COLUMN "like_count" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "back_catalog_videos" ALTER COLUMN "comment_count" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "subscriber_count" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "view_count" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "video_catalog_links" ALTER COLUMN "view_count" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "video_catalog_links" ALTER COLUMN "like_count" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "video_catalog_links" ALTER COLUMN "comment_count" SET DATA TYPE bigint;