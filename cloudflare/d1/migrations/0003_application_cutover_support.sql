-- Supabase PostgresからD1へアプリデータを切り替えるための運用列。
-- 認証情報そのものは引き続きSupabase Authで保持する。
PRAGMA foreign_keys = ON;

ALTER TABLE recipes ADD COLUMN moderated_at TEXT;
ALTER TABLE recipes ADD COLUMN moderated_by TEXT;
ALTER TABLE recipes ADD COLUMN moderation_reason TEXT;
ALTER TABLE recipes ADD COLUMN moderation_previous_visibility TEXT;
ALTER TABLE recipes ADD COLUMN purge_claimed_at TEXT;
ALTER TABLE recipes ADD COLUMN purge_last_error TEXT;
ALTER TABLE recipes ADD COLUMN trashed_from_status TEXT CHECK (trashed_from_status IN ('draft', 'published'));
ALTER TABLE recipes ADD COLUMN trashed_from_visibility TEXT CHECK (trashed_from_visibility IN ('public', 'private'));

ALTER TABLE user_notifications ADD COLUMN email_sent_at TEXT;
ALTER TABLE user_notifications ADD COLUMN email_error_code TEXT;

CREATE INDEX IF NOT EXISTS recipes_purge_queue_idx
  ON recipes (status, purge_after, purge_claimed_at)
  WHERE status = 'deleted';
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON user_notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx
  ON reports (target_type, recipe_id, profile_user_id, status, created_at DESC);
