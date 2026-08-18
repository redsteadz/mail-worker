import { describe, expect, it, vi } from "vitest";
import { parseTransactionFromRawEmail } from "../src/parse";
import { normalizeTransaction } from "../src/normalize/normalizeTransaction";

const raw = `From: Meezan Bank <alerts@meezanbank.com>
To: budget@example.com
Subject: Credit Transaction Alert
Message-ID: <meezan-DEMO0001@example.com>
Content-Type: text/plain; charset=UTF-8

Dear Customer, PKR 1,234.56 has been received from DEMO SENDER into your account xxx0001 on 15-Jan-2026 at 09:30. Branch: DEMO BRANCH. Counterparty account xxx0002. TID: DEMO0001.`;

const debitRaw = `From: Meezan Bank <alerts@meezanbank.com>
To: budget@example.com
Subject: Debit Transaction
Message-ID: <meezan-debit@example.com>
Content-Type: text/plain; charset=UTF-8

Dear Customer,

PKR 50.00 sent to DEMO BENEFICIARY (ASAAN AC) (MBL AC on account xxx0001 with the following details:

Mode : Fund Transfer

Branch : DEMO BRANCH

Transaction Date : 16-Jan-2026

Transaction Time : 19:12`;

const raastDebitRaw = `From: Meezan Bank <alerts@meezanbank.com>
To: budget@example.com
Subject: RAAST Debit Transaction Alert
Message-ID: <meezan-raast-debit@example.com>
Content-Type: text/plain; charset=UTF-8

Dear Customer,

PKR 50.00 sent from your account xxx0001 with the following details:

Beneficiary Account Title: : DEMO BENEFICIARY

Branch : DEMO BRANCH

Transaction Date : 16-Jan-2026

Transaction Time : 19:33

For any assistance CONTACT US.`;

const oneBillDebitRaw = `From: Meezan Bank <alerts@meezanbank.com>
To: budget@example.com
Subject: Debit Transaction Alert
Message-ID: <meezan-onebill@example.com>
Content-Type: text/plain; charset=UTF-8

Dear Customer,

PKR 8,300.00 is Debited from your account xxx0001 with the following details:

Mode : 1BILL INVOICES 10000000000000000000

Branch : DEMO BRANCH

Transaction Date : 19-Jan-2026

Transaction Time : 17:25`;

describe("Meezan parser", () => {
  it("parses credit transaction email", async () => {
    const { parsed } = await parseTransactionFromRawEmail(raw);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      description: "Received from DEMO SENDER",
      vendor: "DEMO SENDER",
      amount: "1234.56",
      currency: "PKR",
      type: "credit",
      date: "2026-01-15",
      time: "09:30",
      reference: "DEMO0001",
      accountHint: "xxx0001"
    });
    expect(parsed?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("normalizes amount", async () => {
    const { parsed } = await parseTransactionFromRawEmail(raw);
    if (!parsed) throw new Error("parser failed");
    const normalized = normalizeTransaction(parsed);
    expect(normalized.amount).toBe("1234.56");
    expect(normalized.amountNumber).toBe(1234.56);
  });

  it("parses sent-to debit transaction email without TID", async () => {
    const { parsed } = await parseTransactionFromRawEmail(debitRaw);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      description: "Paid to DEMO BENEFICIARY",
      vendor: "DEMO BENEFICIARY",
      amount: "50.00",
      currency: "PKR",
      type: "debit",
      date: "2026-01-16",
      time: "19:12",
      accountHint: "xxx0001",
      branch: "DEMO BRANCH"
    });
    expect(parsed?.reference).toMatch(/^NOREF-/);
    expect(parsed?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("parses RAAST debit beneficiary title instead of footer text", async () => {
    const { parsed } = await parseTransactionFromRawEmail(raastDebitRaw);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      description: "Paid to DEMO BENEFICIARY",
      vendor: "DEMO BENEFICIARY",
      amount: "50.00",
      currency: "PKR",
      type: "debit",
      date: "2026-01-16",
      time: "19:33",
      accountHint: "xxx0001",
      branch: "DEMO BRANCH"
    });
    expect(parsed?.vendor).not.toBe("CONTACT US");
    expect(parsed?.reference).toMatch(/^NOREF-/);
    expect(parsed?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("uses Gemini structured extraction for an unrecognized 1BILL debit", async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify({
            isTransaction: true,
            amount: "8,300.00",
            currency: "PKR",
            type: "debit",
            date: "2026-01-19",
            time: "17:25",
            vendor: "1BILL INVOICES 10000000000000000000",
            accountHint: "xxx0001",
            branch: "DEMO BRANCH",
            reference: null,
            confidence: 0.94
          }) }]
        }
      }]
    }), { status: 200 })) as unknown as typeof fetch;

    const { parsed } = await parseTransactionFromRawEmail(oneBillDebitRaw, {
      geminiApiKey: "test-key",
      fetch: mockFetch
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(parsed).toMatchObject({
      description: "Paid to 1BILL INVOICES 10000000000000000000",
      vendor: "1BILL INVOICES 10000000000000000000",
      amount: "8300.00",
      currency: "PKR",
      type: "debit",
      date: "2026-01-19",
      time: "17:25",
      accountHint: "xxx0001",
      branch: "DEMO BRANCH",
      confidence: 0.94
    });
    expect(parsed?.reference).toMatch(/^NOREF-/);
  });

  it("does not call Gemini when the deterministic parser succeeds", async () => {
    const mockFetch = vi.fn() as unknown as typeof fetch;
    const { parsed } = await parseTransactionFromRawEmail(raw, {
      geminiApiKey: "test-key",
      fetch: mockFetch
    });

    expect(parsed).not.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not send non-Meezan email to Gemini", async () => {
    const mockFetch = vi.fn() as unknown as typeof fetch;
    const { parsed } = await parseTransactionFromRawEmail(`From: sender@example.com
Subject: Lunch receipt
Content-Type: text/plain

Paid PKR 500 for lunch.`, {
      geminiApiKey: "test-key",
      fetch: mockFetch
    });

    expect(parsed).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects incomplete Gemini transaction data", async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify({
            isTransaction: true,
            amount: "8,300.00",
            currency: "PKR",
            type: "debit",
            date: "2026-01-19",
            vendor: "1BILL INVOICES 10000000000000000000",
            confidence: 0.94
          }) }]
        }
      }]
    }), { status: 200 })) as unknown as typeof fetch;

    const { parsed } = await parseTransactionFromRawEmail(oneBillDebitRaw, {
      geminiApiKey: "test-key",
      fetch: mockFetch
    });

    expect(parsed).toBeNull();
  });
});
