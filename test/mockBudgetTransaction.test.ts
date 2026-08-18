import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetClient } from "../src/budget/client";
import type { AppConfig, NormalizedTransaction } from "../src/types";

const config: AppConfig = {
  nextcloudBaseUrl: "https://nextcloud.example.com",
  username: "budget-user",
  appPassword: "app-password",
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
  amount: "1234.56",
  amountNumber: 1234.56,
  currency: "PKR",
  type: "credit",
  date: "2026-01-15",
  time: "09:30",
  reference: "DEMO0001",
  accountHint: "xxx0001",
  counterpartyAccountHint: "xxx0002",
  branch: "DEMO BRANCH",
  confidence: 0.95
};

describe("mock Budget transaction sending", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a create-transaction request with expected payload", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      requests.push({ url: url.toString(), init });
      return Response.json({
        id: 987,
        accountId: 123,
        date: "2026-01-15",
        description: "Received from DEMO SENDER",
        amount: 1234.56,
        type: "credit",
        vendor: "DEMO SENDER",
        reference: "DEMO0001"
      });
    });

    const created = await new BudgetClient(config).createTransaction(123, transaction, "Mock import notes");

    expect(created.id).toBe(987);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://nextcloud.example.com/apps/budget/api/transactions");
    expect(requests[0]?.init.method).toBe("POST");
    expect(requests[0]?.init.headers).toMatchObject({
      Authorization: `Basic ${btoa("budget-user:app-password")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "OCS-APIRequest": "true"
    });
    expect(JSON.parse(requests[0]?.init.body as string)).toEqual({
      accountId: 123,
      date: "2026-01-15",
      description: "Received from DEMO SENDER",
      amount: 1234.56,
      type: "credit",
      vendor: "DEMO SENDER",
      reference: "DEMO0001",
      notes: "Mock import notes",
      excludedFromForecast: false
    });
  });
});
