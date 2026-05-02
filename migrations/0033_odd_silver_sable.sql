ALTER TABLE "youtube_quota_usage" ADD COLUMN "broadcast_ops" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_quota_usage" ADD COLUMN "livechat_ops" integer DEFAULT 0 NOT NULL;