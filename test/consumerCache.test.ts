import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env, NormalizedTransaction, RawMessageRow } from "../src/types";

const parseTransactionFromRawEmail = vi.fn();
const mapAccountId = vi.fn();
const cacheTransaction = vi.fn();
const updateRawStatus = vi.fn();
const insertFailure = vi.fn();
const createTransactionWithDedupe = vi.fn();

vi.mock("../src/parse", () => ({ parseTransactionFromRawEmail }));
vi.mock("../src/mapping/accountMapper", () => ({ mapAccountId }));
vi.mock("../src/budget/createTransaction", () => ({ createTransactionWithDedupe }));
vi.mock("../src/idempotency/store", async () => {
  const actual = await vi.importActual<typeof import("../src/idempotency/store")>("../src/idempotency/store");
  return {
    ...actual,
    cacheTransaction,
    insertFailure,
    updateRawStatus,
    getRawMessage: vi.fn()
  };
});

const { getRawMessage } = await import("../src/idempotency/store");
const { processRawMessage } = await import("../src/queue/consumer");

const transaction: NormalizedTransaction = {
  parser: "meezan",
  description: "Received from DEMO SENDER",
  vendor: "DEMO SENDER",
  amount: "1234.56",
  amountNumber: 1234.56,
  currency: "PKR",
  type: "credit",
  date: "2026-01-15",
  reference: "DEMO0001",
  accountHint: "xxx0001",
  confidence: 0.95
};

function baseEnv(): Env {
  return {
    DB: {} as D1Database,
    INGESTION_QUEUE: {} as Queue,
    NEXTCLOUD_BASE_URL: "https://nextcloud.example.com",
    BUDGET_AUTH_MODE: "basic",
    BUDGET_USERNAME: "user",
    BUDGET_APP_PASSWORD: "pass",
    ALLOW_DEFAULT_ACCOUNT: "false",
    ADMIN_REPLAY_TOKEN: "token",
    CONFIDENCE_THRESHOLD: "0.75",
    DEDUPE_WINDOW_DAYS: "3",
    MAX_RETRY_ATTEMPTS: "5",
    RAW_EMAIL_RETENTION_DAYS: "30",
    ENABLE_GEMINI_FALLBACK: "false"
  } as Env;
}

function baseRow(overrides: Partial<RawMessageRow>): RawMessageRow {
  return {
    id: "raw_1",
    source: "cloudflare-email-routing",
    from_address: null,
    to_address: null,
    subject: null,
    message_id: "msg-1",
    received_at: "2026-07-25T00:00:00.000Z",
    raw_content: "raw email body",
    status: "processing",
    attempts: 1,
    last_error: null,
    next_retry_at: null,
    cached_transaction_json: null,
    cached_account_id: null,
    ...overrides
  };
}

describe("processRawMessage cached transaction reuse", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips re-parsing and reuses the cached transaction when present", async () => {
    vi.mocked(getRawMessage).mockResolvedValue(baseRow({
      cached_transaction_json: JSON.stringify(transaction),
      cached_account_id: 42
    }));
    createTransactionWithDedupe.mockResolvedValue({ status: "imported", transactionId: 1 });

    await processRawMessage(baseEnv(), "raw_1");

    expect(parseTransactionFromRawEmail).not.toHaveBeenCalled();
    expect(mapAccountId).not.toHaveBeenCalled();
    expect(cacheTransaction).not.toHaveBeenCalled();
    expect(createTransactionWithDedupe).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 42,
      transaction
    }));
  });

  it("parses and caches the transaction on first success", async () => {
    vi.mocked(getRawMessage).mockResolvedValue(baseRow({}));
    parseTransactionFromRawEmail.mockResolvedValue({ parsed: transaction });
    mapAccountId.mockResolvedValue({ accountId: 42, source: "mapping" });
    createTransactionWithDedupe.mockResolvedValue({ status: "imported", transactionId: 1 });

    await processRawMessage(baseEnv(), "raw_1");

    expect(parseTransactionFromRawEmail).toHaveBeenCalledTimes(1);
    expect(cacheTransaction).toHaveBeenCalledWith(expect.anything(), "raw_1", 42, transaction);
    expect(createTransactionWithDedupe).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 42,
      transaction
    }));
  });

  it("records when Gemini fallback is disabled", async () => {
    vi.mocked(getRawMessage).mockResolvedValue(baseRow({}));
    parseTransactionFromRawEmail.mockResolvedValue({ parsed: null });

    await processRawMessage(baseEnv(), "raw_1");

    const detail = "No deterministic parser matched; Gemini fallback is disabled";
    expect(updateRawStatus).toHaveBeenLastCalledWith(expect.anything(), "raw_1", "manual_review", detail);
    expect(insertFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ detail }));
  });

  it("records when Gemini fallback has no API key", async () => {
    vi.mocked(getRawMessage).mockResolvedValue(baseRow({}));
    parseTransactionFromRawEmail.mockResolvedValue({ parsed: null });

    await processRawMessage({ ...baseEnv(), ENABLE_GEMINI_FALLBACK: "true" }, "raw_1");

    const detail = "No deterministic parser matched; GEMINI_API_KEY is not configured";
    expect(updateRawStatus).toHaveBeenLastCalledWith(expect.anything(), "raw_1", "manual_review", detail);
    expect(insertFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ detail }));
  });

  it("records when Gemini returns no valid transaction", async () => {
    vi.mocked(getRawMessage).mockResolvedValue(baseRow({}));
    parseTransactionFromRawEmail.mockResolvedValue({ parsed: null });

    await processRawMessage({ ...baseEnv(), ENABLE_GEMINI_FALLBACK: "true", GEMINI_API_KEY: "test-key" }, "raw_1");

    const detail = "No deterministic parser matched; Gemini returned no valid transaction";
    expect(updateRawStatus).toHaveBeenLastCalledWith(expect.anything(), "raw_1", "manual_review", detail);
    expect(insertFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ detail }));
  });
});
