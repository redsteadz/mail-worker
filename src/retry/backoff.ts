const BASE_DELAY_MS = 15 * 60 * 1000;
const CAP_DELAY_MS = 8 * 60 * 60 * 1000;

export function computeNextRetryDelayMs(attempts: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(exponential, CAP_DELAY_MS);
}

export function computeNextRetryAt(attempts: number, now: Date = new Date()): string {
  return new Date(now.getTime() + computeNextRetryDelayMs(attempts)).toISOString();
}
