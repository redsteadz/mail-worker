import { sha256Hex } from "../crypto";
import type { NormalizedTransaction } from "../types";

export async function buildImportId(sourceMessageId: string | null, accountId: number, transaction: NormalizedTransaction): Promise<string> {
  const fingerprint = JSON.stringify({
    sourceMessageId: sourceMessageId || "unknown-message-id",
    accountId,
    date: transaction.date,
    amount: transaction.amount,
    type: transaction.type,
    vendor: transaction.vendor.toUpperCase(),
    reference: transaction.reference,
    accountHint: transaction.accountHint
  });
  return sha256Hex(fingerprint);
}

export function buildFingerprint(accountId: number, transaction: NormalizedTransaction): Record<string, unknown> {
  return {
    accountId,
    date: transaction.date,
    amount: transaction.amount,
    type: transaction.type,
    vendor: transaction.vendor,
    reference: transaction.reference,
    accountHint: transaction.accountHint,
    parser: transaction.parser
  };
}
