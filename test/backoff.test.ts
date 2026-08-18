import { describe, expect, it } from "vitest";
import { computeNextRetryAt, computeNextRetryDelayMs } from "../src/retry/backoff";

describe("computeNextRetryDelayMs", () => {
  it("scales exponentially from a 15 minute base", () => {
    expect(computeNextRetryDelayMs(1)).toBe(15 * 60 * 1000);
    expect(computeNextRetryDelayMs(2)).toBe(30 * 60 * 1000);
    expect(computeNextRetryDelayMs(3)).toBe(60 * 60 * 1000);
    expect(computeNextRetryDelayMs(4)).toBe(2 * 60 * 60 * 1000);
    expect(computeNextRetryDelayMs(5)).toBe(4 * 60 * 60 * 1000);
  });

  it("caps at 8 hours and repeats forever instead of growing further", () => {
    expect(computeNextRetryDelayMs(6)).toBe(8 * 60 * 60 * 1000);
    expect(computeNextRetryDelayMs(7)).toBe(8 * 60 * 60 * 1000);
    expect(computeNextRetryDelayMs(50)).toBe(8 * 60 * 60 * 1000);
  });
});

describe("computeNextRetryAt", () => {
  it("adds the computed delay to the given time", () => {
    const now = new Date("2026-07-25T00:00:00.000Z");
    expect(computeNextRetryAt(1, now)).toBe("2026-07-25T00:15:00.000Z");
    expect(computeNextRetryAt(6, now)).toBe("2026-07-25T08:00:00.000Z");
  });
});
