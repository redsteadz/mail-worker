import { BudgetClient } from "../src/budget/client";
import { normalizeTransaction } from "../src/normalize/normalizeTransaction";
import { parseTransactionFromRawEmail } from "../src/parse";
import type { AppConfig } from "../src/types";
import { demoAccountId, loadDotEnv, requireEnv, requireHttpsUrl } from "./env";

loadDotEnv();

const rawEmail = demoEmail();
const { parsed } = await parseTransactionFromRawEmail(rawEmail, {
  ...(process.env.ENABLE_GEMINI_FALLBACK === "true" && process.env.GEMINI_API_KEY
    ? { geminiApiKey: process.env.GEMINI_API_KEY }
    : {}),
  ...(process.env.GEMINI_MODEL ? { geminiModel: process.env.GEMINI_MODEL } : {})
});
if (!parsed) throw new Error("Demo email did not parse into a transaction");

const accountId = demoAccountId();
const transaction = normalizeTransaction(parsed);
const client = new BudgetClient(configFromEnv());
const created = await client.createTransaction(accountId, transaction, demoNotes());

console.log(JSON.stringify({ ok: true, mode: "demo-email", accountId, transactionId: created.id, transaction }, null, 2));

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

function demoEmail(): string {
  const amount = Number(process.env.DEMO_TRANSACTION_AMOUNT || "1.23");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("DEMO_TRANSACTION_AMOUNT must be positive");

  const now = new Date();
  const date = process.env.DEMO_TRANSACTION_DATE || now.toISOString().slice(0, 10);
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) throw new Error("DEMO_TRANSACTION_DATE must be YYYY-MM-DD");

  const meezanDate = `${day}-${monthName(month)}-${year}`;
  const vendor = process.env.DEMO_TRANSACTION_VENDOR || "OPENCODE DEMO";
  const reference = process.env.DEMO_TRANSACTION_REFERENCE || `DEMO${Date.now()}`;
  const accountHint = process.env.DEMO_ACCOUNT_HINT || "xxx0001";

  return `From: Meezan Bank <alerts@meezanbank.com>
To: budget@example.com
Subject: Transaction Alert
Message-ID: <${reference.toLowerCase()}@demo.local>
Content-Type: text/plain; charset=UTF-8

Dear Customer, PKR ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been received from ${vendor} into your account ${accountHint} on ${meezanDate} at 12:34. Branch: DEMO BRANCH. Counterparty account xxx0001. TID: ${reference}.`;
}

function monthName(month: string): string {
  const names: Record<string, string> = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
    "10": "Oct",
    "11": "Nov",
    "12": "Dec"
  };
  const name = names[month];
  if (!name) throw new Error("DEMO_TRANSACTION_DATE month must be 01-12");
  return name;
}

function demoNotes(): string {
  return `DEMO EMAIL TEST TRANSACTION. Safe to delete. Created by send-demo-email script at ${new Date().toISOString()}.`;
}
