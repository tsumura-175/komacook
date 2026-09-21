-- Cloudflare Workers 運用のための非破壊的な追加スキーマ。
-- メール本文は配信・再送に必要な期間だけ保持し、完了後は Cron で削除する。
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mail_outbox (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('contact', 'report', 'member_notification')),
  recipient TEXT NOT NULL CHECK (length(trim(recipient)) BETWEEN 3 AND 254),
  reply_to TEXT,
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 180),
  text_body TEXT NOT NULL CHECK (length(text_body) BETWEEN 1 AND 10000),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  expires_at TEXT NOT NULL,
  CHECK ((status = 'sent' AND sent_at IS NOT NULL) OR status <> 'sent')
);

-- アップロード完了前のR2オブジェクトを追跡する。所有者・用途が一致しない画像の参照を防ぎ、
-- 中断されたアップロードを定期削除できるようにする。
CREATE TABLE IF NOT EXISTS image_uploads (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('avatar', 'recipe', 'recipe_step')),
  staging_key TEXT NOT NULL UNIQUE,
  final_key TEXT,
  content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 8192),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 8192),
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'committed', 'discarded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS mail_outbox_delivery_idx
  ON mail_outbox (status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS mail_outbox_expiry_idx ON mail_outbox (expires_at);
CREATE INDEX IF NOT EXISTS image_uploads_owner_idx ON image_uploads (owner_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS image_uploads_expiry_idx ON image_uploads (status, expires_at);
