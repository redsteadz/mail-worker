export interface Env {
  DB: D1Database;
  INGESTION_QUEUE: Queue<IngestionQueueMessage>;
  NEXTCLOUD_BASE_URL: string;
  BUDGET_AUTH_MODE: "basic";
  BUDGET_USERNAME: string;
  BUDGET_APP_PASSWORD: string;
  BUDGET_DEFAULT_ACCOUNT_ID?: string;
  ALLOW_DEFAULT_ACCOUNT: string;
  ADMIN_REPLAY_TOKEN: string;
  CONFIDENCE_THRESHOLD: string;
  DEDUPE_WINDOW_DAYS: string;
  MAX_RETRY_ATTEMPTS: string;
  RAW_EMAIL_RETENTION_DAYS?: string;
  ENABLE_GEMINI_FALLBACK?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export interface IngestionQueueMessage {
  rawMessageId: string;
}

export type TransactionType = "credit" | "debit";

export interface ParsedEmail {
  headers: Record<string, string>;
  text: string;
}

export interface ParsedTransaction {
  parser: "meezan";
  description: string;
  vendor: string;
  amount: string;
  currency: string;
  type: TransactionType;
  date: string;
  time?: string;
  reference: string;
  accountHint: string;
  counterpartyAccountHint?: string;
  branch?: string;
  confidence: number;
}

export interface NormalizedTransaction extends ParsedTransaction {
  amountNumber: number;
}

export interface RawMessageRow {
  id: string;
  source: string;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  message_id: string | null;
  received_at: string;
  raw_content: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  cached_transaction_json: string | null;
  cached_account_id: number | null;
}

export interface BudgetTransaction {
  id: number;
  accountId?: number;
  account_id?: number;
  date: string;
  description: string;
  amount: number | string;
  type: TransactionType;
  vendor?: string | null;
  reference?: string | null;
}

export interface AppConfig {
  nextcloudBaseUrl: string;
  username: string;
  appPassword: string;
  allowDefaultAccount: boolean;
  defaultAccountId: number | null;
  confidenceThreshold: number;
  dedupeWindowDays: number;
  maxRetryAttempts: number;
  rawEmailRetentionDays: number;
  enableGeminiFallback: boolean;
}
