-- こまクックのCloudflare D1用スキーマ。
-- 認証ユーザーはSupabase Authで管理するため、auth.usersの複製テーブルは作らない。
-- UUID・時刻はSQLiteで扱いやすいTEXT（RFC 3339 / ISO 8601）として保存する。
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'こまクックユーザー' CHECK (length(trim(display_name)) BETWEEN 1 AND 30),
  standard_servings INTEGER NOT NULL DEFAULT 2 CHECK (standard_servings BETWEEN 1 AND 20),
  family_adults INTEGER CHECK (family_adults BETWEEN 0 AND 20),
  family_children INTEGER CHECK (family_children BETWEEN 0 AND 20),
  show_family INTEGER NOT NULL DEFAULT 0 CHECK (show_family IN (0, 1)),
  avatar_kind TEXT NOT NULL DEFAULT 'preset' CHECK (avatar_kind IN ('preset', 'upload')),
  preset_avatar_key TEXT NOT NULL DEFAULT 'utensils',
  avatar_color TEXT NOT NULL DEFAULT 'coral',
  avatar_key TEXT,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deletion_pending')),
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_completed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (show_family = 0 OR family_adults IS NOT NULL OR family_children IS NOT NULL),
  CHECK ((avatar_kind = 'preset' AND avatar_key IS NULL) OR avatar_kind = 'upload')
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role = 'admin'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS user_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK (length(trim(consent_type)) BETWEEN 1 AND 30),
  document_version TEXT NOT NULL CHECK (length(trim(document_version)) BETWEEN 1 AND 30),
  accepted INTEGER NOT NULL CHECK (accepted IN (0, 1)),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, consent_type, document_version)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) > 0 AND slug NOT GLOB '*[^a-z0-9-]*'),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 30),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL DEFAULT '' CHECK (length(trim(title)) <= 100),
  description TEXT CHECK (description IS NULL OR length(description) <= 3000),
  base_servings REAL NOT NULL DEFAULT 2 CHECK (base_servings > 0 AND base_servings <= 100),
  cooking_time_minutes INTEGER CHECK (cooking_time_minutes BETWEEN 1 AND 1440),
  calories_per_serving INTEGER CHECK (calories_per_serving BETWEEN 0 AND 10000),
  allergy_notes TEXT CHECK (allergy_notes IS NULL OR length(allergy_notes) <= 2000),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deleted')),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'copied')),
  source_recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  source_author_user_id TEXT,
  source_name TEXT,
  source_url TEXT,
  image_key TEXT,
  published_at TEXT,
  deleted_at TEXT,
  purge_after TEXT,
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status <> 'draft' OR visibility = 'private'),
  CHECK (status <> 'published' OR (category_id IS NOT NULL AND length(trim(title)) >= 1)),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
  CHECK (purge_after IS NULL OR deleted_at IS NOT NULL),
  CHECK (source_type <> 'copied' OR source_recipe_id IS NOT NULL),
  CHECK (source_type <> 'copied' OR visibility = 'private'),
  CHECK (owner_user_id IS NOT NULL OR visibility = 'public')
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  quantity_value REAL CHECK (quantity_value >= 0),
  quantity_display TEXT,
  quantity_text TEXT,
  unit TEXT,
  note TEXT,
  group_name TEXT,
  is_scalable INTEGER NOT NULL DEFAULT 1 CHECK (is_scalable IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipe_id, sort_order),
  CHECK (quantity_value IS NOT NULL OR quantity_text IS NOT NULL),
  CHECK (quantity_value IS NOT NULL OR is_scalable = 0)
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  instruction TEXT NOT NULL CHECK (length(trim(instruction)) BETWEEN 1 AND 2000),
  image_key TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipe_id, sort_order)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 20),
  normalized_name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'hidden')),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'members')),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  publish_at TEXT,
  end_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_at IS NULL OR publish_at IS NULL OR end_at > publish_at)
);

CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notice_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  action_href TEXT,
  email_delivery_status TEXT,
  read_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('recipe', 'profile')),
  recipe_id TEXT REFERENCES recipes(id) ON DELETE CASCADE,
  profile_user_id TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('copyright', 'dangerous', 'inappropriate', 'spam', 'other')),
  detail TEXT CHECK (detail IS NULL OR length(detail) <= 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_note TEXT,
  handled_by TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((target_type = 'recipe' AND recipe_id IS NOT NULL AND profile_user_id IS NULL) OR (target_type = 'profile' AND profile_user_id IS NOT NULL AND recipe_id IS NULL))
);

CREATE TABLE IF NOT EXISTS contact_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  inquiry_type TEXT NOT NULL,
  delivery_succeeded INTEGER NOT NULL CHECK (delivery_succeeded IN (0, 1)),
  error_code TEXT,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_rate_limits (
  identifier_hash TEXT NOT NULL CHECK (length(identifier_hash) = 64),
  bucket TEXT NOT NULL CHECK (bucket IN ('10m', '24h')),
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  PRIMARY KEY (identifier_hash, bucket)
);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  user_id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delete_after TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'processing', 'completed', 'failed')),
  cancelled_at TEXT,
  completed_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS admin_actions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS recipes_public_feed_idx ON recipes (published_at DESC, id) WHERE visibility = 'public' AND status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS recipes_owner_updated_idx ON recipes (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS recipes_category_idx ON recipes (category_id, published_at DESC);
CREATE INDEX IF NOT EXISTS recipes_title_idx ON recipes (title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS recipe_ingredients_name_idx ON recipe_ingredients (name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS recipe_tags_tag_idx ON recipe_tags (tag_id, recipe_id);
CREATE INDEX IF NOT EXISTS favorites_user_time_idx ON favorites (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notices_publish_idx ON notices (is_pinned DESC, publish_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS reports_status_time_idx ON reports (status, created_at);
CREATE INDEX IF NOT EXISTS account_deletion_queue_idx ON account_deletion_requests (status, delete_after);
CREATE UNIQUE INDEX IF NOT EXISTS reports_recipe_reporter_unique ON reports (reporter_user_id, recipe_id) WHERE target_type = 'recipe';
CREATE UNIQUE INDEX IF NOT EXISTS reports_profile_reporter_unique ON reports (reporter_user_id, profile_user_id) WHERE target_type = 'profile';
