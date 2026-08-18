export class BudgetApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryable: boolean) {
    super(message);
  }
}

export class GeminiApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryable: boolean) {
    super(message);
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof BudgetApiError || error instanceof GeminiApiError) return error.retryable;
  return error instanceof TypeError;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
