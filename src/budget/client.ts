import type { AppConfig, BudgetTransaction, NormalizedTransaction } from "../types";
import { BudgetApiError, isRetryableStatus } from "../retry/retryPolicy";

export class BudgetClient {
  constructor(private readonly config: AppConfig) {}

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.nextcloudBaseUrl}/status.php`, {
        method: "GET",
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async findMatchingTransactions(accountId: number, transaction: NormalizedTransaction): Promise<BudgetTransaction[]> {
    const { from, to } = dateWindow(transaction.date, this.config.dedupeWindowDays);
    const url = new URL(`${this.config.nextcloudBaseUrl}/apps/budget/api/transactions`);
    url.searchParams.set("accountId", String(accountId));
    url.searchParams.set("dateFrom", from);
    url.searchParams.set("dateTo", to);
    url.searchParams.set("limit", "100");
    url.searchParams.set("sort", "date");
    url.searchParams.set("direction", "desc");

    const payload = await this.request<{ transactions?: BudgetTransaction[] } | BudgetTransaction[]>(url, { method: "GET" });
    const transactions = Array.isArray(payload) ? payload : payload.transactions || [];
    return transactions.filter((candidate) => sameTransaction(candidate, accountId, transaction));
  }

  async createTransaction(accountId: number, transaction: NormalizedTransaction, notes: string): Promise<BudgetTransaction> {
    const url = new URL(`${this.config.nextcloudBaseUrl}/apps/budget/api/transactions`);
    return this.request<BudgetTransaction>(url, {
      method: "POST",
      body: JSON.stringify({
        accountId,
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amountNumber,
        type: transaction.type,
        vendor: transaction.vendor,
        reference: transaction.reference,
        notes,
        excludedFromForecast: false
      })
    });
  }

  private async request<T>(url: URL, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Basic ${btoa(`${this.config.username}:${this.config.appPassword}`)}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "OCS-APIRequest": "true",
        ...init.headers
      }
    });

    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      const suffix = requestId ? ` (request ${requestId})` : "";
      throw new BudgetApiError(`Budget API request failed with status ${response.status}${suffix}`, response.status, isRetryableStatus(response.status));
    }

    return response.json() as Promise<T>;
  }
}

function sameTransaction(candidate: BudgetTransaction, accountId: number, transaction: NormalizedTransaction): boolean {
  const candidateAccountId = candidate.accountId ?? candidate.account_id;
  if (candidateAccountId !== undefined && Number(candidateAccountId) !== accountId) return false;
  return candidate.date === transaction.date
    && Number(candidate.amount).toFixed(2) === transaction.amount
    && candidate.type === transaction.type
    && normalize(candidate.reference || "") === normalize(transaction.reference)
    && normalize(candidate.vendor || candidate.description) === normalize(transaction.vendor || transaction.description);
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function dateWindow(date: string, days: number): { from: string; to: string } {
  const base = new Date(`${date}T00:00:00Z`);
  const from = new Date(base);
  const to = new Date(base);
  from.setUTCDate(from.getUTCDate() - days);
  to.setUTCDate(to.getUTCDate() + days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
