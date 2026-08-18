import { BudgetClient } from "./budget/client";
import { getConfig } from "./config";
import { redactExpiredRawMessages, selectRetryableRawMessages, updateRawStatus } from "./idempotency/store";
import type { Env } from "./types";
import { logInfo } from "./observability/logger";

export async function handleScheduled(env: Env): Promise<void> {
  const config = getConfig(env);
  const redacted = await redactExpiredRawMessages(env.DB, config.rawEmailRetentionDays);

  const client = new BudgetClient(config);
  const healthy = await client.checkHealth();
  if (!healthy) {
    logInfo("scheduled sweep skipped: backend unhealthy", { redacted });
    return;
  }

  const rows = await selectRetryableRawMessages(env.DB, 25);
  for (const row of rows) {
    await updateRawStatus(env.DB, row.id, "queued", null);
    await env.INGESTION_QUEUE.send({ rawMessageId: row.id });
  }
  logInfo("scheduled sweep complete", { queued: rows.length, redacted });
}
