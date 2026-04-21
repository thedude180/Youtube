ALTER TABLE "users" ADD COLUMN "google_access_token" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_refresh_token" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_token_expires_at" timestamp;