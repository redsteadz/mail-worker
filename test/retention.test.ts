import { describe, expect, it } from "vitest";
import { redactExpiredRawMessages } from "../src/idempotency/store";

describe("raw email retention", () => {
  it("redacts sensitive fields only from terminal messages", async () => {
    const statements: string[] = [];
    const bindings: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind(...values: unknown[]) {
            bindings.push(values);
            return {
              async run() {
                return { meta: { changes: 2 } };
              }
            };
          }
        };
      }
    } as unknown as D1Database;

    await expect(redactExpiredRawMessages(db, 30)).resolves.toBe(2);
    expect(statements[0]).toContain("raw_content = ''");
    expect(statements[0]).toContain("manual_review");
    expect(statements[0]).not.toContain("'retryable'");
    expect(bindings[0]?.[0]).toEqual(expect.any(String));
  });
});
