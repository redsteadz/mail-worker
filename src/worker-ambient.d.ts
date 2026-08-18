interface D1ExecResult {
  count: number;
  duration: number;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes?: number; [key: string]: unknown };
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface Queue<T = unknown> {
  send(message: T): Promise<void>;
}

interface Message<T = unknown> {
  body: T;
  ack(): void;
  retry(): void;
}

interface MessageBatch<T = unknown> {
  messages: Message<T>[];
}

interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
}

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
}
