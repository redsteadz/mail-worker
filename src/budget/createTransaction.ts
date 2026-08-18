import { BudgetClient } from "./client";
import { buildFingerprint, buildImportId } from "../idempotency/importId";
import { claimImportId, insertFailure, transactionNotes, updateImportStatus, updateRawStatus } from "../idempotency/store";
import { isRetryableError } from "../retry/retryPolicy";
import type { AppConfig, NormalizedTransaction, RawMessageRow } from "../types";

export async function createTransactionWithDedupe(input: {
  db: D1Database;
  config: AppConfig;
  rawMessage: RawMessageRow;
  accountId: number;
  transaction: NormalizedTransaction;
}): Promise<{ status: "imported" | "already_exists" | "duplicate"; transactionId?: number }> {
  const importId = await buildImportId(input.rawMessage.message_id, input.accountId, input.transaction);
  const claim = await claimImportId(input.db, {
    importId,
    rawMessageId: input.rawMessage.id,
    accountId: input.accountId,
    fingerprint: buildFingerprint(input.accountId, input.transaction)
  });

  if (claim === "exists") {
    await updateRawStatus(input.db, input.rawMessage.id, "duplicate", null);
    return { status: "duplicate" };
  }

  const client = new BudgetClient(input.config);
  let matches;
  try {
    matches = await client.findMatchingTransactions(input.accountId, input.transaction);
  } catch (error) {
    await releaseFailedClaim(input.db, importId, error);
    throw error;
  }

  if (matches.length === 1) {
    const matched = matches[0];
    if (!matched) throw new Error("Matched transaction disappeared");
    const transactionId = matched.id;
    await updateImportStatus(input.db, importId, "already_exists", transactionId);
    await updateRawStatus(input.db, input.rawMessage.id, "already_exists", null);
    return { status: "already_exists", transactionId };
  }

  if (matches.length > 1) {
    await updateImportStatus(input.db, importId, "manual_review", null);
    await updateRawStatus(input.db, input.rawMessage.id, "manual_review", "Multiple possible existing Budget transactions");
    await insertFailure(input.db, {
      rawMessageId: input.rawMessage.id,
      importId,
      reason: "ambiguous_duplicate",
      detail: "Multiple possible existing Budget transactions matched pre-create dedupe",
      retryable: false
    });
    return { status: "duplicate" };
  }

  let created;
  try {
    created = await client.createTransaction(input.accountId, input.transaction, transactionNotes(importId, input.transaction));
  } catch (error) {
    await releaseFailedClaim(input.db, importId, error);
    throw error;
  }
  await updateImportStatus(input.db, importId, "imported", created.id);
  await updateRawStatus(input.db, input.rawMessage.id, "imported", null);
  return { status: "imported", transactionId: created.id };
}

async function releaseFailedClaim(db: D1Database, importId: string, error: unknown): Promise<void> {
  try {
    await updateImportStatus(db, importId, isRetryableError(error) ? "retryable" : "failed", null);
  } catch {
    // Same raw message can recover a stale processing claim if this write fails.
  }
}
