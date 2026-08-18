import { describe, expect, it } from "vitest";
import { GeminiApiError, isRetryableError, isRetryableStatus } from "../src/retry/retryPolicy";

describe("retry policy", () => {
  it("retries transient Budget API statuses", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("does not retry validation or auth failures", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });

  it("retries transient Gemini API failures", () => {
    expect(isRetryableError(new GeminiApiError("rate limited", 429, true))).toBe(true);
    expect(isRetryableError(new GeminiApiError("invalid key", 401, false))).toBe(false);
  });
});
