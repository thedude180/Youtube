CREATE TABLE "niche_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"insight_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"priority" text DEFAULT 'medium',
	"sample_count" integer DEFAULT 0,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "niche_video_samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"video_id" text NOT NULL,
	"title" text NOT NULL,
	"channel_name" text,
	"view_count" integer DEFAULT 0,
	"like_count" integer,
	"duration_sec" integer,
	"upload_date" text,
	"url" text NOT NULL,
	"search_query" text,
	"is_short" boolean DEFAULT false,
	"metadata" jsonb,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "ni_user_idx" ON "niche_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ni_created_idx" ON "niche_insights" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nvs_user_idx" ON "niche_video_samples" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nvs_video_id_idx" ON "niche_video_samples" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "nvs_created_idx" ON "niche_video_samples" USING btree ("created_at");