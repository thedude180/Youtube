CREATE TABLE "etgaming247_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"analytics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "etg247_user_idx" ON "etgaming247_packages" USING btree ("user_id");