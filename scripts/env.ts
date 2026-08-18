import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadDotEnv(path = ".env"): void {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) return;

  for (const line of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    const value = unquote(trimmed.slice(equals + 1).trim());
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env`);
  return value;
}

export function demoAccountId(): number {
  const value = process.env.BUDGET_DEMO_ACCOUNT_ID || process.env.BUDGET_DEFAULT_ACCOUNT_ID;
  if (!value) throw new Error("BUDGET_DEMO_ACCOUNT_ID or BUDGET_DEFAULT_ACCOUNT_ID is required in .env");

  const accountId = Number(value);
  if (!Number.isInteger(accountId) || accountId <= 0) throw new Error("Demo account ID must be a positive integer");
  return accountId;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}


export function requireHttpsUrl(name: string): string {
  const value = requireEnv(name).replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  return value;
}
