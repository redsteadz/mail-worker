import type { NormalizedTransaction, ParsedTransaction } from "../types";

export function normalizeTransaction(parsed: ParsedTransaction): NormalizedTransaction {
  const amountNumber = Number(parsed.amount);
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    throw new Error("Invalid transaction amount");
  }

  return {
    ...parsed,
    amount: amountNumber.toFixed(2),
    amountNumber,
    description: parsed.description.trim().replace(/\s+/g, " "),
    vendor: parsed.vendor.trim().replace(/\s+/g, " "),
    reference: parsed.reference.trim(),
    accountHint: parsed.accountHint.trim()
  };
}
