CREATE TABLE "token_budget_usage" (
	"engine" varchar(100) NOT NULL,
	"day" varchar(10) NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"last_throttled_at" bigint,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tbu_engine_day_idx" ON "token_budget_usage" USING btree ("engine","day");
