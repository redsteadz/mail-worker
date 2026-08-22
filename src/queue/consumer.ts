import { createTransactionWithDedupe } from "../budget/createTransaction";
import { getConfig } from "../config";
import { cacheTransaction, getRawMessage, incrementAttempt, insertFailure, markRetryable, updateRawStatus } from "../idempotency/store";
import { mapAccountId } from "../mapping/accountMapper";
import { normalizeTransaction } from "../normalize/normalizeTransaction";
import { parseTransactionFromRawEmail } from "../parse";
import { computeNextRetryAt } from "../retry/backoff";
import { errorMessage, isRetryableError } from "../retry/retryPolicy";
import type { Env, IngestionQueueMessage, NormalizedTransaction } from "../types";
import { logError, logInfo } from "../observability/logger";

export async function processRawMessage(env: Env, rawMessageId: string): Promise<void> {
  const config = getConfig(env);
  const rawMessage = await getRawMessage(env.DB, rawMessageId);
  if (!rawMessage) throw new Error(`Raw message not found: ${rawMessageId}`);

  await updateRawStatus(env.DB, rawMessageId, "processing", null);

  let transaction: NormalizedTransaction;
  let accountId: number;
  let accountSource: string | undefined;

  if (rawMessage.cached_transaction_json && rawMessage.cached_account_id !== null) {
    transaction = JSON.parse(rawMessage.cached_transaction_json) as NormalizedTransaction;
    accountId = rawMessage.cached_account_id;
  } else {
    const { parsed } = await parseTransactionFromRawEmail(rawMessage.raw_content, {
      ...(config.enableGeminiFallback && env.GEMINI_API_KEY ? { geminiApiKey: env.GEMINI_API_KEY } : {}),
      ...(env.GEMINI_MODEL ? { geminiModel: env.GEMINI_MODEL } : {})
    });
    if (!parsed) {
      const detail = !config.enableGeminiFallback
        ? "No deterministic parser matched; Gemini fallback is disabled"
        : env.GEMINI_API_KEY
          ? "No deterministic parser matched; Gemini returned no valid transaction"
          : "No deterministic parser matched; GEMINI_API_KEY is not configured";
      await updateRawStatus(env.DB, rawMessageId, "manual_review", detail);
      await insertFailure(env.DB, { rawMessageId, importId: null, reason: "unsupported_email", detail, retryable: false });
      return;
    }

    if (parsed.confidence < config.confidenceThreshold) {
      await updateRawStatus(env.DB, rawMessageId, "manual_review", `Parser confidence ${parsed.confidence} below threshold`);
      await insertFailure(env.DB, { rawMessageId, importId: null, reason: "low_confidence", detail: JSON.stringify(parsed), retryable: false });
      return;
    }

    transaction = normalizeTransaction(parsed);
    const account = await mapAccountId(env.DB, transaction.accountHint, config);
    if (!account) {
      await updateRawStatus(env.DB, rawMessageId, "manual_review", `No account mapping for ${transaction.accountHint}`);
      await insertFailure(env.DB, { rawMessageId, importId: null, reason: "unresolved_account", detail: transaction.accountHint, retryable: false });
      return;
    }

    accountId = account.accountId;
    accountSource = account.source;
    await cacheTransaction(env.DB, rawMessageId, accountId, transaction);
  }

  const result = await createTransactionWithDedupe({
    db: env.DB,
    config,
    rawMessage,
    accountId,
    transaction
  });

  logInfo("message processed", { rawMessageId, status: result.status, transactionId: result.transactionId, accountSource });
}

export async function consumeQueue(batch: MessageBatch<IngestionQueueMessage>, env: Env): Promise<void> {
  const config = getConfig(env);
  for (const message of batch.messages) {
    try {
      await processRawMessage(env, message.body.rawMessageId);
      message.ack();
    } catch (error) {
      const rawMessageId = message.body.rawMessageId;
      const detail = errorMessage(error);
      const attempts = await incrementAttempt(env.DB, rawMessageId, detail);

      if (isRetryableError(error) && attempts < config.maxRetryAttempts) {
        const nextRetryAt = computeNextRetryAt(attempts);
        await markRetryable(env.DB, rawMessageId, detail, nextRetryAt);
        logError("retryable processing failure", { rawMessageId, error: detail, nextRetryAt });
        message.ack();
        continue;
      }

      const reason = isRetryableError(error) ? "retry_exhausted" : "processing_failed";
      await updateRawStatus(env.DB, rawMessageId, "failed", detail);
      await insertFailure(env.DB, { rawMessageId, importId: null, reason, detail, retryable: false });
      logError("non-retryable processing failure", { rawMessageId, error: detail });
      message.ack();
    }
  }
}
