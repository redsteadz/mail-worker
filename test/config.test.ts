import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config";
import type { Env } from "../src/types";

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    INGESTION_QUEUE: {} as Queue,
    NEXTCLOUD_BASE_URL: "https://nextcloud.example.com",
    BUDGET_AUTH_MODE: "basic",
    BUDGET_USERNAME: "budget-user",
    BUDGET_APP_PASSWORD: "test-app-password",
    ALLOW_DEFAULT_ACCOUNT: "false",
    ADMIN_REPLAY_TOKEN: "test-replay-token",
    CONFIDENCE_THRESHOLD: "0.75",
    DEDUPE_WINDOW_DAYS: "3",
    MAX_RETRY_ATTEMPTS: "5",
    RAW_EMAIL_RETENTION_DAYS: "30",
    ENABLE_GEMINI_FALLBACK: "false",
    ...overrides
  };
}

describe("configuration", () => {
  it("requires an HTTPS Nextcloud URL", () => {
    expect(() => getConfig(env({ NEXTCLOUD_BASE_URL: "http://nextcloud.example.com" }))).toThrow("must use HTTPS");
  });

  it("keeps Gemini disabled unless explicitly enabled", () => {
    expect(getConfig(env()).enableGeminiFallback).toBe(false);
    expect(getConfig(env({ ENABLE_GEMINI_FALLBACK: "true" })).enableGeminiFallback).toBe(true);
  });

  it("validates retention and retry limits", () => {
    expect(() => getConfig(env({ RAW_EMAIL_RETENTION_DAYS: "0" }))).toThrow("positive integer");
    expect(() => getConfig(env({ MAX_RETRY_ATTEMPTS: "not-a-number" }))).toThrow("positive integer");
  });
});
