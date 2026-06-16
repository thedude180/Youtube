CREATE TABLE "brain_skill_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"skill_id" integer NOT NULL,
	"skill_name" text NOT NULL,
	"fact" text NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'reasoning' NOT NULL,
	"application_count" integer DEFAULT 0 NOT NULL,
	"last_validated_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "brain_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mastery_score" integer DEFAULT 0 NOT NULL,
	"mastery_threshold" integer DEFAULT 80 NOT NULL,
	"learning_cycle_count" integer DEFAULT 0 NOT NULL,
	"current_focus_area" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"mastered_at" timestamp,
	"last_cycle_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "bsm_user_idx" ON "brain_skill_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bsm_skill_idx" ON "brain_skill_memories" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "bsm_confidence_idx" ON "brain_skill_memories" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "bs_user_idx" ON "brain_skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bs_status_idx" ON "brain_skills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bs_priority_idx" ON "brain_skills" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX "bs_user_name_uq" ON "brain_skills" USING btree ("user_id","name");