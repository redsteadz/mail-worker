import { describe, expect, it } from "vitest";
import { handleEmail } from "../src/email";
import type { Env, IngestionQueueMessage } from "../src/types";

const raw = `From: Meezan Bank <alerts@meezanbank.com>
To: budget@example.com
Subject: Transaction Alert
Message-ID: <meezan-DEMO0001@example.com>
Content-Type: text/plain; charset=UTF-8

Dear Customer, PKR 1,234.56 has been received from DEMO SENDER into your account xxx0001 on 15-Jan-2026 at 09:30. Branch: DEMO BRANCH. Counterparty account xxx0002. TID: DEMO0001.`;

describe("mock email ingestion", () => {
  it("stores received email and queues raw message id", async () => {
    const inserts: unknown[][] = [];
    const queued: IngestionQueueMessage[] = [];
    const env = {
      DB: createInsertOnlyD1(inserts),
      INGESTION_QUEUE: {
        async send(message: IngestionQueueMessage): Promise<void> {
          queued.push(message);
        }
      }
    } as unknown as Env;

    await handleEmail({
      from: "alerts@meezanbank.com",
      to: "budget@example.com",
      raw: textStream(raw)
    } as ForwardableEmailMessage, env);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual([
      expect.stringMatching(/^raw_/),
      "cloudflare-email-routing",
      "alerts@meezanbank.com",
      "budget@example.com",
      "Transaction Alert",
      "<meezan-DEMO0001@example.com>",
      expect.any(String),
      raw
    ]);
    expect(queued).toEqual([{ rawMessageId: inserts[0]?.[0] as string }]);
  });

  it("rejects mail from an untrusted envelope sender", async () => {
    const inserts: unknown[][] = [];
    const queued: IngestionQueueMessage[] = [];
    const env = {
      DB: createInsertOnlyD1(inserts),
      INGESTION_QUEUE: {
        async send(message: IngestionQueueMessage): Promise<void> {
          queued.push(message);
        }
      }
    } as unknown as Env;

    await handleEmail({
      from: "attacker@example.com",
      to: "budget@example.com",
      raw: textStream(raw)
    } as ForwardableEmailMessage, env);

    expect(inserts).toHaveLength(0);
    expect(queued).toHaveLength(0);
  });
});

function createInsertOnlyD1(inserts: unknown[][]): D1Database {
  return {
    prepare() {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              inserts.push(values);
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  } as unknown as D1Database;
}

function textStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}
