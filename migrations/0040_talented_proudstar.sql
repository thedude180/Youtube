CREATE TABLE "pipeline_traces" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"queue_item_id" integer,
	"youtube_video_id" text,
	"content_type" text,
	"game_name" text,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer,
	"detail" jsonb,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pt_user_idx" ON "pipeline_traces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pt_queue_item_idx" ON "pipeline_traces" USING btree ("queue_item_id");--> statement-breakpoint
CREATE INDEX "pt_youtube_id_idx" ON "pipeline_traces" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "pt_stage_idx" ON "pipeline_traces" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "pt_created_idx" ON "pipeline_traces" USING btree ("created_at");