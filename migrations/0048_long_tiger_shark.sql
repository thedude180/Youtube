CREATE TABLE "creative_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"file_path" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"tags" text[] DEFAULT '{}',
	"performance_score" real DEFAULT 50 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"avg_retention" real,
	"avg_ctr" real,
	"source" text DEFAULT 'ai_generated' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "cl_channel_type_idx" ON "creative_library" USING btree ("channel_id","type");--> statement-breakpoint
CREATE INDEX "cl_performance_idx" ON "creative_library" USING btree ("performance_score");--> statement-breakpoint
CREATE INDEX "cl_active_idx" ON "creative_library" USING btree ("active");--> statement-breakpoint
CREATE INDEX "cl_channel_active_idx" ON "creative_library" USING btree ("channel_id","active");