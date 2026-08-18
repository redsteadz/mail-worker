import type { AppConfig } from "../types";
import { resolveAccountId } from "../idempotency/store";

export async function mapAccountId(db: D1Database, accountHint: string, config: AppConfig): Promise<{ accountId: number; source: "mapping" | "default" } | null> {
  const mapped = await resolveAccountId(db, accountHint);
  if (mapped) return { accountId: mapped, source: "mapping" };
  if (config.allowDefaultAccount && config.defaultAccountId) return { accountId: config.defaultAccountId, source: "default" };
  return null;
}
