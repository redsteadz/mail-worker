import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetClient } from "../src/budget/client";
import { createTransactionWithDedupe } from "../src/budget/createTransaction";
import { claimImportId } from "../src/idempotency/store";
import type { AppConfig, NormalizedTransaction, RawMessageRow } from "../src/types";

const config: AppConfig = {
  nextcloudBaseUrl: "https://nextcloud.example.com",
  username: "user",
  appPassword: "pass",
  allowDefaultAccount: false,
  defaultAccountId: null,
  confidenceThreshold: 0.75,
  dedupeWindowDays: 3,
  maxRetryAttempts: 5,
  rawEmailRetentionDays: 30,
  enableGeminiFallback: false
};

const transaction: NormalizedTransaction = {
  parser: "meezan",
  description: "Received from DEMO SENDER",
  vendor: "DEMO SENDER",
  amount: "100000.00",
  amountNumber: 100000,
  currency: "PKR",
  type: "credit",
  date: "2026-08-11",
  reference: "NOREF-5OD1CT",
  accountHint: "xxx0001",
  confidence: 1
};

const rawMessage: RawMessageRow = {
  id: "raw_1",
  source: "cloudflare-email-routing",
  from_address: null,
  to_address: null,
  subject: "RAAST Credit Transaction Alert",
  message_id: "message-1",
  received_at: "2026-08-10T20:11:10.875Z",
  raw_content: "raw email",
  status: "processing",
  attempts: 0,
  last_error: null,
  next_retry_at: null,
  cached_transaction_json: JSON.stringify(transaction),
  cached_account_id: 1
};

describe("idempotency retry recovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reclaims a retryable or stale processing key for the same raw message", async () => {
    const runs = [{ meta: { changes: 0 } }, { meta: { changes: 1 } }];
    const statements: string[] = [];
    const db = {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind() {
            return { run: async () => runs.shift() };
          }
        };
      }
    } as unknown as D1Database;

    await expect(claimImportId(db, {
      importId: "import-1",
      rawMessageId: "raw_1",
      accountId: 1,
      fingerprint: {}
    })).resolves.toBe("claimed");

    expect(statements[1]).toContain("raw_message_id = ?");
    expect(statements[1]).toContain("status = 'retryable'");
    expect(statements[1]).toContain("-10 minutes");
  });

  it("marks the claim retryable when Budget is unavailable", async () => {
    const statuses: string[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              run: async () => {
                if (sql.includes("INSERT OR IGNORE")) return { meta: { changes: 1 } };
                if (sql.includes("UPDATE idempotency_keys")) statuses.push(String(values[0]));
                return { meta: { changes: 1 } };
              }
            };
          }
        };
      }
    } as unknown as D1Database;
    vi.spyOn(BudgetClient.prototype, "findMatchingTransactions").mockRejectedValue(new TypeError("fetch failed"));

    await expect(createTransactionWithDedupe({
      db,
      config,
      rawMessage,
      accountId: 1,
      transaction
    })).rejects.toThrow("fetch failed");

    expect(statuses).toEqual(["retryable"]);
  });
});
