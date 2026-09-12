-- create-asi-tables.sql
--
-- Idempotent bootstrap for the v1 ("shared/schema.ts") tables that the
-- autonomous ASI systems depend on. These tables live in the v1 monolithic
-- schema, which `npm run db:push` does NOT manage (db:push is pointed at the
-- v2 modular schema in shared/schema.drizzle.ts). This script fills that gap.
--
-- Safe to run repeatedly: every statement uses IF NOT EXISTS and never drops
-- or alters existing tables/data.
--
-- Applied automatically by scripts/post-merge.sh after db:push.

-- ── Strategy Brain ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategy_state (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT NOT NULL,
  game_weights          JSONB DEFAULT '{}'::jsonb,
  optimal_duration_min  INTEGER DEFAULT 10,
  optimal_publish_hour  INTEGER DEFAULT 15,
  title_formula         TEXT,
  thumbnail_style       TEXT,
  signal_versions       JSONB DEFAULT '{}'::jsonb,
  engine_weights        JSONB DEFAULT '{}'::jsonb,
  raw_signals           JSONB DEFAULT '{}'::jsonb,
  computed_at           TIMESTAMP DEFAULT now(),
  updated_at            TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ss_user_idx ON strategy_state (user_id);

-- ── Action Outcomes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_outcomes (
  id                          SERIAL PRIMARY KEY,
  user_id                     TEXT NOT NULL,
  action_id                   INTEGER NOT NULL,
  youtube_video_id            TEXT,
  baseline_views              INTEGER,
  baseline_ctr                REAL,
  baseline_avg_view_duration  REAL,
  outcome_views               INTEGER,
  outcome_ctr                 REAL,
  outcome_avg_view_duration   REAL,
  delta_views_pct             REAL,
  delta_ctr_pct               REAL,
  verdict                     TEXT,
  engine_source               TEXT,
  measure_after               TIMESTAMP NOT NULL,
  measured_at                 TIMESTAMP,
  created_at                  TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ao_user_idx ON action_outcomes (user_id);
CREATE INDEX IF NOT EXISTS ao_action_idx ON action_outcomes (action_id);
CREATE INDEX IF NOT EXISTS ao_measure_idx ON action_outcomes (measure_after);

-- ── Engine Accuracy ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engine_accuracy (
  id                   SERIAL PRIMARY KEY,
  user_id              TEXT NOT NULL,
  engine_name          TEXT NOT NULL,
  total_predictions    INTEGER NOT NULL DEFAULT 0,
  correct_predictions  INTEGER NOT NULL DEFAULT 0,
  accuracy_rate        REAL NOT NULL DEFAULT 0.5,
  last_updated_at      TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ea_user_engine_idx ON engine_accuracy (user_id, engine_name);

-- ── YouTube Output Metrics ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS youtube_output_metrics (
  id                        SERIAL PRIMARY KEY,
  user_id                   TEXT NOT NULL,
  youtube_video_id          TEXT NOT NULL,
  source_video_id           INTEGER,
  content_type              TEXT NOT NULL,
  duration_sec              INTEGER,
  duration_bucket           TEXT,
  game_name                 TEXT,
  posting_window            TEXT,
  impressions               INTEGER DEFAULT 0,
  ctr                       REAL DEFAULT 0,
  views                     INTEGER DEFAULT 0,
  average_view_duration_sec INTEGER DEFAULT 0,
  average_view_percent      REAL DEFAULT 0,
  watch_time_minutes        REAL DEFAULT 0,
  likes                     INTEGER DEFAULT 0,
  comments                  INTEGER DEFAULT 0,
  subscribers_gained        INTEGER DEFAULT 0,
  retention_drop_off_sec    INTEGER,
  first_24h_views           INTEGER DEFAULT 0,
  first_72h_views           INTEGER DEFAULT 0,
  seven_day_views           INTEGER DEFAULT 0,
  performance_score         REAL DEFAULT 0,
  hook_retention_pct        REAL,
  thumbnail_style_tag       TEXT,
  measured_at               TIMESTAMP,
  published_at              TIMESTAMP,
  metadata                  JSONB DEFAULT '{}'::jsonb,
  created_at                TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yom_user_idx ON youtube_output_metrics (user_id);
CREATE INDEX IF NOT EXISTS yom_type_idx ON youtube_output_metrics (content_type);
CREATE INDEX IF NOT EXISTS yom_bucket_idx ON youtube_output_metrics (duration_bucket);
CREATE INDEX IF NOT EXISTS yom_game_idx ON youtube_output_metrics (game_name);
CREATE INDEX IF NOT EXISTS yom_ytid_idx ON youtube_output_metrics (youtube_video_id);
CREATE INDEX IF NOT EXISTS yom_hook_idx ON youtube_output_metrics (hook_retention_pct);
CREATE INDEX IF NOT EXISTS yom_thumb_style_idx ON youtube_output_metrics (thumbnail_style_tag);

-- ── Action Execution Log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS action_execution_log (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  action_id    INTEGER,
  action_type  TEXT NOT NULL,
  target_id    TEXT,
  outcome      TEXT NOT NULL,
  details      JSONB,
  executed_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ael_user_idx ON action_execution_log (user_id);
CREATE INDEX IF NOT EXISTS ael_action_idx ON action_execution_log (action_id);
CREATE INDEX IF NOT EXISTS ael_executed_idx ON action_execution_log (executed_at);

-- ── Clip Extraction Jobs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clip_extraction_jobs (
  id                   SERIAL PRIMARY KEY,
  user_id              TEXT NOT NULL,
  source_video_id      TEXT NOT NULL,
  start_time_sec       REAL NOT NULL,
  end_time_sec         REAL NOT NULL,
  format               TEXT NOT NULL DEFAULT 'long_form',
  target_duration_min  INTEGER,
  suggested_title      TEXT,
  suggested_tags       TEXT[],
  game_title           TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  output_path          TEXT,
  youtube_video_id     TEXT,
  error_message        TEXT,
  retry_count          INTEGER NOT NULL DEFAULT 0,
  autopilot_queue_id   INTEGER,
  metadata             JSONB,
  created_at           TIMESTAMP NOT NULL DEFAULT now(),
  started_at           TIMESTAMP,
  completed_at         TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cej_user_idx ON clip_extraction_jobs (user_id);
CREATE INDEX IF NOT EXISTS cej_status_idx ON clip_extraction_jobs (status);
CREATE INDEX IF NOT EXISTS cej_source_idx ON clip_extraction_jobs (source_video_id);
CREATE INDEX IF NOT EXISTS cej_created_idx ON clip_extraction_jobs (created_at);

-- ── Content Performance Insights ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_performance_insights (
  id                     SERIAL PRIMARY KEY,
  user_id                TEXT NOT NULL,
  game_title             TEXT NOT NULL,
  format                 TEXT NOT NULL DEFAULT 'long_form',
  duration_bucket_min    INTEGER,
  publish_hour           INTEGER,
  avg_ctr                REAL,
  avg_watch_time_percent REAL,
  avg_views              INTEGER,
  avg_avd_sec            REAL,
  sample_size            INTEGER NOT NULL DEFAULT 0,
  updated_at             TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cpi_user_game_idx ON content_performance_insights (user_id, game_title);
CREATE INDEX IF NOT EXISTS cpi_user_format_idx ON content_performance_insights (user_id, format);
CREATE INDEX IF NOT EXISTS cpi_updated_idx ON content_performance_insights (updated_at);

-- ── Longform Extraction Segments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS longform_extraction_segments (
  id                SERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL,
  source_video_id   INTEGER NOT NULL,
  start_sec         INTEGER NOT NULL,
  end_sec           INTEGER NOT NULL,
  duration_sec      INTEGER NOT NULL,
  title             TEXT,
  description       TEXT,
  tags              TEXT[] DEFAULT '{}',
  game_name         TEXT,
  quality_score     INTEGER DEFAULT 5,
  retention_score   INTEGER DEFAULT 5,
  hook_description  TEXT,
  ending_type       TEXT,
  content_category  TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  queue_item_id     INTEGER,
  youtube_video_id  TEXT,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lfe_user_idx ON longform_extraction_segments (user_id);
CREATE INDEX IF NOT EXISTS lfe_source_idx ON longform_extraction_segments (source_video_id);
CREATE INDEX IF NOT EXISTS lfe_status_idx ON longform_extraction_segments (status);
