CREATE TABLE "capability_gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"domain" text NOT NULL,
	"gap_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'identified' NOT NULL,
	"solution_type" text,
	"solution_ref" text,
	"solution_summary" text,
	"identified_by" text DEFAULT 'autonomous-capability-engine' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"filled_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "cg_user_idx" ON "capability_gaps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cg_status_idx" ON "capability_gaps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cg_domain_idx" ON "capability_gaps" USING btree ("domain");