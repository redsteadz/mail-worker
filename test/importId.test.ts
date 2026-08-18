import { describe, expect, it } from "vitest";
import { buildImportId } from "../src/idempotency/importId";
import type { NormalizedTransaction } from "../src/types";

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

describe("import id", () => {
  it("is deterministic", async () => {
    await expect(buildImportId("<message>", 123, transaction)).resolves.toBe(await buildImportId("<message>", 123, transaction));
  });

  it("changes when stable transaction fields change", async () => {
    const first = await buildImportId("<message>", 123, transaction);
    const second = await buildImportId("<message>", 124, transaction);
    expect(first).not.toBe(second);
  });
});
