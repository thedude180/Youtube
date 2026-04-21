CREATE TABLE "internet_benchmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"domain" text NOT NULL,
	"domain_label" text NOT NULL,
	"search_queries" text[],
	"web_summary" text,
	"gap_found" text,
	"gap_severity" integer DEFAULT 0,
	"capability_built" text,
	"capability_type" text,
	"capability_ref" text,
	"pipelines_updated" text[],
	"status" text DEFAULT 'searching' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "ib_user_idx" ON "internet_benchmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ib_domain_idx" ON "internet_benchmarks" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "ib_status_idx" ON "internet_benchmarks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ib_created_idx" ON "internet_benchmarks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prt_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prt_token_idx" ON "password_reset_tokens" USING btree ("token");