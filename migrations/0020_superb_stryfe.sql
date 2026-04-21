CREATE TABLE "stream_edit_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"vault_entry_id" integer,
	"source_title" text,
	"source_file_path" text,
	"source_duration_secs" integer,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"clip_duration_mins" integer DEFAULT 60,
	"enhancements" jsonb DEFAULT '{"upscale4k":true,"audioNormalize":true,"colorEnhance":true,"sharpen":true}'::jsonb,
	"status" text DEFAULT 'queued',
	"progress" integer DEFAULT 0,
	"total_clips" integer DEFAULT 0,
	"completed_clips" integer DEFAULT 0,
	"output_dir" text,
	"output_files" jsonb DEFAULT '[]'::jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "stream_edit_jobs_user_idx" ON "stream_edit_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_edit_jobs_status_idx" ON "stream_edit_jobs" USING btree ("status");