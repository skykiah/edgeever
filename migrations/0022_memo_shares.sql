PRAGMA foreign_keys = ON;

CREATE TABLE memo_shares (
  id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  token TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (memo_id) REFERENCES memos(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  UNIQUE (memo_id),
  UNIQUE (token)
);

CREATE INDEX idx_memo_shares_workspace
  ON memo_shares(workspace_id, updated_at DESC);
