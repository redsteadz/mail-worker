ALTER TABLE raw_messages ADD COLUMN next_retry_at TEXT;
ALTER TABLE raw_messages ADD COLUMN cached_transaction_json TEXT;
ALTER TABLE raw_messages ADD COLUMN cached_account_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_raw_messages_retry_schedule ON raw_messages(status, next_retry_at);
