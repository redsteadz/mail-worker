import type { NormalizedTransaction, RawMessageRow } from "../types";
import { newId } from "../crypto";

export async function insertRawMessage(db: D1Database, input: {
  source: string;
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  messageId: string | null;
  rawContent: string;
}): Promise<string> {
  const id = newId("raw");
  await db.prepare(
    `INSERT INTO raw_messages (id, source, from_address, to_address, subject, message_id, received_at, raw_content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.source, input.fromAddress, input.toAddress, input.subject, input.messageId, new Date().toISOString(), input.rawContent).run();
  return id;
}

export async function getRawMessage(db: D1Database, id: string): Promise<RawMessageRow | null> {
  return db.prepare("SELECT * FROM raw_messages WHERE id = ?").bind(id).first<RawMessageRow>();
}

export async function updateRawStatus(db: D1Database, id: string, status: string, error: string | null = null): Promise<void> {
  await db.prepare(
    `UPDATE raw_messages
     SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(status, error, id).run();
}

export async function markRetryable(db: D1Database, id: string, error: string, nextRetryAt: string): Promise<void> {
  await db.prepare(
    `UPDATE raw_messages
     SET status = 'retryable', last_error = ?, next_retry_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(error, nextRetryAt, id).run();
}

export async function cacheTransaction(db: D1Database, id: string, accountId: number, transaction: NormalizedTransaction): Promise<void> {
  await db.prepare(
    `UPDATE raw_messages
     SET cached_transaction_json = ?, cached_account_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(JSON.stringify(transaction), accountId, id).run();
}

export async function incrementAttempt(db: D1Database, id: string, error: string): Promise<number> {
  const row = await db.prepare(
    `UPDATE raw_messages
     SET attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING attempts`
  ).bind(error, id).first<{ attempts: number }>();
  return row?.attempts ?? 1;
}

export async function resolveAccountId(db: D1Database, accountHint: string): Promise<number | null> {
  const row = await db.prepare("SELECT account_id AS accountId FROM account_mappings WHERE account_hint = ?").bind(accountHint).first<{ accountId: number }>();
  return row?.accountId ?? null;
}

export async function claimImportId(db: D1Database, input: {
  importId: string;
  rawMessageId: string;
  accountId: number;
  fingerprint: Record<string, unknown>;
}): Promise<"claimed" | "exists"> {
  const result = await db.prepare(
    `INSERT OR IGNORE INTO idempotency_keys (import_id, raw_message_id, account_id, status, fingerprint_json)
     VALUES (?, ?, ?, 'processing', ?)`
  ).bind(input.importId, input.rawMessageId, input.accountId, JSON.stringify(input.fingerprint)).run();
  if (result.meta.changes === 1) return "claimed";

  const reclaimed = await db.prepare(
    `UPDATE idempotency_keys
     SET status = 'processing', updated_at = CURRENT_TIMESTAMP
     WHERE import_id = ?
       AND raw_message_id = ?
       AND (status = 'retryable'
         OR (status = 'processing' AND datetime(updated_at) <= datetime('now', '-10 minutes')))`
  ).bind(input.importId, input.rawMessageId).run();
  return reclaimed.meta.changes === 1 ? "claimed" : "exists";
}

export async function updateImportStatus(db: D1Database, importId: string, status: string, transactionId: number | null = null): Promise<void> {
  await db.prepare(
    `UPDATE idempotency_keys
     SET status = ?, transaction_id = COALESCE(?, transaction_id), updated_at = CURRENT_TIMESTAMP
     WHERE import_id = ?`
  ).bind(status, transactionId, importId).run();
}

export async function insertFailure(db: D1Database, input: {
  rawMessageId: string;
  importId: string | null;
  reason: string;
  detail: string;
  retryable: boolean;
}): Promise<void> {
  await db.prepare(
    `INSERT INTO failed_messages (id, raw_message_id, import_id, reason, detail, retryable)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(newId("fail"), input.rawMessageId, input.importId, input.reason, input.detail, input.retryable ? 1 : 0).run();
}

export function transactionNotes(importId: string, transaction: NormalizedTransaction): string {
  return `Imported from bank email. Worker importId=${importId}. Parser=${transaction.parser}. Confidence=${transaction.confidence}.`;
}

export async function selectRetryableRawMessages(db: D1Database, limit: number): Promise<Array<{ id: string }>> {
  const result = await db.prepare(
    `SELECT id FROM raw_messages
     WHERE status = 'retryable'
       AND (next_retry_at IS NULL OR datetime(next_retry_at) <= datetime('now'))
     ORDER BY updated_at ASC
     LIMIT ?`
  ).bind(limit).all<{ id: string }>();
  return result.results;
}


export async function redactExpiredRawMessages(db: D1Database, retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.prepare(
    `UPDATE raw_messages
     SET from_address = NULL,
         to_address = NULL,
         subject = NULL,
         message_id = NULL,
         raw_content = '',
         last_error = NULL,
         cached_transaction_json = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE received_at < ?
       AND raw_content <> ''
       AND status IN ('imported', 'already_exists', 'duplicate', 'manual_review', 'failed')`
  ).bind(cutoff).run();
  return result.meta.changes ?? 0;
}
