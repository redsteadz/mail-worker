import type { AppConfig, Env } from "./types";

export function getConfig(env: Env): AppConfig {
  if (env.BUDGET_AUTH_MODE !== "basic") {
    throw new Error("Only BUDGET_AUTH_MODE=basic is supported");
  }

  const allowDefaultAccount = env.ALLOW_DEFAULT_ACCOUNT === "true";
  const defaultAccountId = env.BUDGET_DEFAULT_ACCOUNT_ID ? Number(env.BUDGET_DEFAULT_ACCOUNT_ID) : null;
  if (allowDefaultAccount && (!defaultAccountId || !Number.isInteger(defaultAccountId))) {
    throw new Error("BUDGET_DEFAULT_ACCOUNT_ID must be an integer when ALLOW_DEFAULT_ACCOUNT=true");
  }

  const confidenceThreshold = boundedNumber(env.CONFIDENCE_THRESHOLD || "0.75", "CONFIDENCE_THRESHOLD", 0, 1);
  const dedupeWindowDays = positiveInteger(env.DEDUPE_WINDOW_DAYS || "3", "DEDUPE_WINDOW_DAYS");
  const maxRetryAttempts = positiveInteger(env.MAX_RETRY_ATTEMPTS || "5", "MAX_RETRY_ATTEMPTS");
  const rawEmailRetentionDays = positiveInteger(env.RAW_EMAIL_RETENTION_DAYS || "30", "RAW_EMAIL_RETENTION_DAYS");

  return {
    nextcloudBaseUrl: requireHttpsUrl(env.NEXTCLOUD_BASE_URL),
    username: env.BUDGET_USERNAME,
    appPassword: env.BUDGET_APP_PASSWORD,
    allowDefaultAccount,
    defaultAccountId,
    confidenceThreshold,
    dedupeWindowDays,
    maxRetryAttempts,
    rawEmailRetentionDays,
    enableGeminiFallback: env.ENABLE_GEMINI_FALLBACK === "true"
  };
}

function requireHttpsUrl(value: string): string {
  const normalized = value.replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("NEXTCLOUD_BASE_URL must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("NEXTCLOUD_BASE_URL must use HTTPS");
  }
  return normalized;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function boundedNumber(value: string, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}
