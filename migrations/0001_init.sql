CREATE TABLE IF NOT EXISTS raw_messages (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  message_id TEXT,
  received_at TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_messages_status ON raw_messages(status, received_at);
CREATE INDEX IF NOT EXISTS idx_raw_messages_message_id ON raw_messages(message_id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  import_id TEXT PRIMARY KEY,
  raw_message_id TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  transaction_id INTEGER,
  status TEXT NOT NULL,
  fingerprint_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(raw_message_id) REFERENCES raw_messages(id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_account_status ON idempotency_keys(account_id, status);

CREATE TABLE IF NOT EXISTS account_mappings (
  account_hint TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS failed_messages (
  id TEXT PRIMARY KEY,
  raw_message_id TEXT NOT NULL,
  import_id TEXT,
  reason TEXT NOT NULL,
  detail TEXT,
  retryable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(raw_message_id) REFERENCES raw_messages(id)
);
