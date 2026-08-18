import { parseEmail } from "./emailParser";
import { normalizeMeezanWithGemini } from "./geminiNormalizer";
import { parseMeezanTransaction } from "./meezanParser";

interface ParseOptions {
  geminiApiKey?: string;
  geminiModel?: string;
  fetch?: typeof fetch;
}

export async function parseTransactionFromRawEmail(raw: string, options: ParseOptions = {}) {
  const email = parseEmail(raw);
  let parsed = parseMeezanTransaction(email.text, email.headers.subject || "");
  if (!parsed && options.geminiApiKey) {
    parsed = await normalizeMeezanWithGemini(email, {
      apiKey: options.geminiApiKey,
      ...(options.geminiModel ? { model: options.geminiModel } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {})
    });
  }
  return { email, parsed };
}
