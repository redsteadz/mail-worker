import { parseEmail } from "./parse/emailParser";
import { insertRawMessage } from "./idempotency/store";
import type { Env } from "./types";
import { logInfo } from "./observability/logger";

const MAX_EMAIL_BYTES = 256 * 1024;

export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  if (!isTrustedMeezanSender(message.from)) {
    logInfo("email rejected", { reason: "untrusted_sender" });
    return;
  }

  const rawContent = await streamToText(message.raw, MAX_EMAIL_BYTES);
  const parsed = parseEmail(rawContent);
  const rawMessageId = await insertRawMessage(env.DB, {
    source: "cloudflare-email-routing",
    fromAddress: message.from || parsed.headers.from || null,
    toAddress: message.to || parsed.headers.to || null,
    subject: parsed.headers.subject || null,
    messageId: parsed.headers["message-id"] || null,
    rawContent
  });

  await env.INGESTION_QUEUE.send({ rawMessageId });
  logInfo("email queued", { rawMessageId });
}

export function isTrustedMeezanSender(value: string): boolean {
  const bracketed = /<([^>]+)>/.exec(value)?.[1];
  const address = (bracketed || value).trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  const domain = address.slice(at + 1);
  return domain === "meezanbank.com" || domain.endsWith(".meezanbank.com");
}

async function streamToText(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Email exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}
