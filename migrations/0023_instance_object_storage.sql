PRAGMA foreign_keys = ON;

CREATE TABLE object_storage_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('builtin', 's3')),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  endpoint TEXT,
  region TEXT,
  bucket TEXT,
  access_key_id TEXT,
  secret_access_key_encrypted TEXT,
  force_path_style INTEGER NOT NULL DEFAULT 1 CHECK (force_path_style IN (0, 1)),
  object_prefix TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_object_storage_single_active
  ON object_storage_configs(is_active)
  WHERE is_active = 1;

INSERT INTO object_storage_configs (id, provider, display_name, is_active)
VALUES ('builtin', 'builtin', 'Built-in object storage', 1);

ALTER TABLE resources
  ADD COLUMN storage_config_id TEXT NOT NULL DEFAULT 'builtin';

CREATE INDEX idx_resources_storage_config
  ON resources(storage_config_id, object_key);
