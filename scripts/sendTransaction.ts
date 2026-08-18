import { BudgetClient } from "../src/budget/client";
import type { AppConfig, NormalizedTransaction } from "../src/types";
import { demoAccountId, loadDotEnv, requireEnv, requireHttpsUrl } from "./env";

loadDotEnv();

const accountId = demoAccountId();
const transaction = demoTransaction();
const client = new BudgetClient(configFromEnv());
const created = await client.createTransaction(accountId, transaction, demoNotes("direct-send"));

console.log(JSON.stringify({ ok: true, mode: "direct-send", accountId, transactionId: created.id, transaction }, null, 2));

function configFromEnv(): AppConfig {
  const authMode = requireEnv("BUDGET_AUTH_MODE");
  if (authMode !== "basic") throw new Error("Only BUDGET_AUTH_MODE=basic is supported");

  return {
    nextcloudBaseUrl: requireHttpsUrl("NEXTCLOUD_BASE_URL"),
    username: requireEnv("BUDGET_USERNAME"),
    appPassword: requireEnv("BUDGET_APP_PASSWORD"),
    allowDefaultAccount: process.env.ALLOW_DEFAULT_ACCOUNT === "true",
    defaultAccountId: process.env.BUDGET_DEFAULT_ACCOUNT_ID ? Number(process.env.BUDGET_DEFAULT_ACCOUNT_ID) : null,
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || "0.75"),
    dedupeWindowDays: Number(process.env.DEDUPE_WINDOW_DAYS || "3"),
    maxRetryAttempts: Number(process.env.MAX_RETRY_ATTEMPTS || "5"),
    rawEmailRetentionDays: Number(process.env.RAW_EMAIL_RETENTION_DAYS || "30"),
    enableGeminiFallback: process.env.ENABLE_GEMINI_FALLBACK === "true"
  };
}

function demoTransaction(): NormalizedTransaction {
  const amount = Number(process.env.DEMO_TRANSACTION_AMOUNT || "1.23");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("DEMO_TRANSACTION_AMOUNT must be positive");

  const reference = process.env.DEMO_TRANSACTION_REFERENCE || `DEMO-${Date.now()}`;
  const date = process.env.DEMO_TRANSACTION_DATE || new Date().toISOString().slice(0, 10);
  const vendor = process.env.DEMO_TRANSACTION_VENDOR || "OPENCODE DEMO";

  return {
    parser: "meezan",
    description: `Demo transaction from ${vendor}`,
    vendor,
    amount: amount.toFixed(2),
    amountNumber: amount,
    currency: "PKR",
    type: "credit",
    date,
    reference,
    accountHint: process.env.DEMO_ACCOUNT_HINT || "demo-account",
    confidence: 1
  };
}

function demoNotes(mode: string): string {
  return `DEMO TEST TRANSACTION. Safe to delete. Created by ${mode} script at ${new Date().toISOString()}.`;
}
