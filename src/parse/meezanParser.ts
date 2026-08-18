import type { ParsedTransaction, TransactionType } from "../types";

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

type FieldName = "amount" | "vendor" | "date" | "time" | "reference" | "accountHint" | "counterpartyAccountHint" | "branch";

interface TemplateRule {
  name: string;
  type: TransactionType;
  subjectMatch: RegExp;
  bodyMustMatch: RegExp[];
  fields: Partial<Record<FieldName, RegExp>>;
  required: FieldName[];
}

interface ParsedFields {
  amount?: string;
  vendor?: string;
  date?: string;
  time?: string;
  reference?: string;
  accountHint?: string;
  counterpartyAccountHint?: string;
  branch?: string;
}

const TEMPLATES: TemplateRule[] = [
  {
    name: "meezan-raast-debit",
    type: "debit",
    subjectMatch: /raast\s+debit\s+transaction\s+alert/i,
    bodyMustMatch: [/sent from your account/i, /Beneficiary Account Title/i],
    fields: {
      amount: /(?:PKR|Rs\.?)\s*([0-9,]+(?:\.\d{1,2})?)/i,
      vendor: /Beneficiary Account Title\s*:\s*:?\s*(.+?)(?:\s+Branch\s*:|\s+Transaction Date\s*:|$)/i,
      accountHint: /account\s+(x{2,}\d{2,6})/i,
      date: /Transaction Date\s*:\s*(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{4})/i,
      time: /Transaction Time\s*:\s*(\d{1,2}:\d{2})(?::\d{2})?/i,
      branch: /Branch\s*:\s*(.+?)(?:\s+Transaction Date\s*:|\s+Transaction Time\s*:|$)/i,
      reference: /(?:TID|Ref(?:erence)?(?: No)?|Transaction ID)[:\s#-]*([A-Z0-9-]+)/i
    },
    required: ["amount", "vendor", "date", "time", "accountHint"]
  },
  {
    name: "meezan-debit-fund-transfer",
    type: "debit",
    subjectMatch: /(?:^|\b)(?:debit\s+transaction|transaction\s+alert)(?:\b|$)/i,
    bodyMustMatch: [/sent to/i, /Mode\s*:\s*Fund Transfer/i],
    fields: {
      amount: /(?:PKR|Rs\.?)\s*([0-9,]+(?:\.\d{1,2})?)/i,
      vendor: /sent to\s+(.+?)\s+(?:\([^)]*\)\s+)*\(?MBL AC/i,
      accountHint: /account\s+(x{2,}\d{2,6})/i,
      date: /Transaction Date\s*:\s*(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{4})/i,
      time: /Transaction Time\s*:\s*(\d{1,2}:\d{2})(?::\d{2})?/i,
      branch: /Branch\s*:\s*(.+?)(?:\s+Transaction Date\s*:|\s+Transaction Time\s*:|$)/i,
      reference: /(?:TID|Ref(?:erence)?(?: No)?|Transaction ID)[:\s#-]*([A-Z0-9-]+)/i
    },
    required: ["amount", "vendor", "date", "time", "accountHint"]
  },
  {
    name: "meezan-credit-received",
    type: "credit",
    subjectMatch: /(?:credit\s+transaction\s+alert|transaction\s+alert)/i,
    bodyMustMatch: [/has been received|credited|received from/i],
    fields: {
      amount: /(?:PKR|Rs\.?|Amount[:\s]+)\s*([0-9,]+(?:\.\d{1,2})?)/i,
      vendor: /received from\s+(.+?)\s+(?:into|in|on|at|account|a\/c|xxx)/i,
      accountHint: /(?:account|a\/c|acct)[^x]*(x{2,}\d{2,6})/i,
      counterpartyAccountHint: /(?:from|to)[^x]*(x{2,}\d{2,6})/i,
      date: /(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{4})/i,
      time: /(?:at|time[:\s]+)\s*(\d{1,2}:\d{2})(?::\d{2})?/i,
      branch: /Branch[:\s]+(.+?)(?:\s+(?:on|at|TID|Ref)|[.,]|$)/i,
      reference: /(?:TID|Ref(?:erence)?(?: No)?|Transaction ID)[:\s#-]*([A-Z0-9-]+)/i
    },
    required: ["amount", "vendor", "date", "accountHint"]
  }
];

export function parseMeezanTransaction(text: string, subject = ""): ParsedTransaction | null {
  const compact = normalizeText(text);
  const normalizedSubject = normalizeSubject(subject);
  if (!/meezan/i.test(compact) && !/transaction/i.test(`${normalizedSubject} ${compact}`)) return null;

  const candidates = TEMPLATES
    .map((template) => parseWithTemplate(template, compact, normalizedSubject))
    .filter((candidate): candidate is ParsedTransaction => candidate !== null)
    .sort((a, b) => b.confidence - a.confidence);

  return candidates[0] ?? null;
}

function parseWithTemplate(template: TemplateRule, compact: string, subject: string): ParsedTransaction | null {
  const subjectMatches = template.subjectMatch.test(subject);
  if (!subjectMatches && template.bodyMustMatch.some((pattern) => !pattern.test(compact))) return null;

  const fields = extractFields(template, compact);
  if (template.required.some((field) => !fields[field])) return null;

  const amountRaw = fields.amount;
  const vendor = fields.vendor;
  const dateRaw = fields.date;
  const accountHint = fields.accountHint;
  if (!amountRaw || !vendor || !dateRaw || !accountHint) return null;

  const date = normalizeDateValue(dateRaw);
  if (!date) return null;

  const amount = amountRaw.replace(/,/g, "");
  const fallbackReferenceInput = { amountRaw, compact, vendor, accountHint, date, ...(fields.time ? { time: fields.time } : {}) };
  const reference = fields.reference ?? buildFallbackReference(fallbackReferenceInput);
  const matchedFields = Object.values(fields).filter(Boolean).length;
  const confidence = Math.min(0.95, (matchedFields + (subjectMatches ? 2 : 0)) / (template.required.length + 3));

  const parsed: ParsedTransaction = {
    parser: "meezan",
    description: template.type === "credit" ? `Received from ${vendor}` : `Paid to ${vendor}`,
    vendor,
    amount,
    currency: "PKR",
    type: template.type,
    date,
    reference,
    accountHint,
    confidence
  };

  if (fields.time) parsed.time = fields.time;
  if (fields.counterpartyAccountHint) parsed.counterpartyAccountHint = fields.counterpartyAccountHint;
  if (fields.branch) parsed.branch = fields.branch;
  return parsed;
}

function extractFields(template: TemplateRule, compact: string): ParsedFields {
  const fields: ParsedFields = {};
  for (const [name, pattern] of Object.entries(template.fields) as Array<[FieldName, RegExp]>) {
    const match = pattern.exec(compact);
    const value = match?.[1];
    if (!value) continue;
    fields[name] = name === "vendor" ? cleanName(value) : cleanField(value);
  }
  return fields;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSubject(value: string): string {
  return normalizeText(value.replace(/^(?:fwd?|re):\s*/i, ""));
}

function normalizeDateValue(value: string): string | null {
  const match = /(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/i.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const monthNumber = MONTHS[match[2].toLowerCase()];
  if (!monthNumber) return null;
  return `${match[3]}-${monthNumber}-${match[1].padStart(2, "0")}`;
}

function cleanName(input: string): string {
  return cleanField(input)
    .replace(/\s*\([^)]*(?:AC|A\/C|ACCOUNT)[^)]*\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim()
    .toUpperCase();
}

function cleanField(input: string): string {
  return input.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
}

export function buildFallbackReference(input: { amountRaw: string; compact: string; vendor: string; accountHint: string; date: string; time?: string }): string {
  const stable = [input.amountRaw, input.vendor, input.accountHint, input.date, input.time || "", input.compact].join("|");
  let hash = 0;
  for (let index = 0; index < stable.length; index += 1) {
    hash = ((hash << 5) - hash + stable.charCodeAt(index)) | 0;
  }
  return `NOREF-${Math.abs(hash).toString(36).toUpperCase()}`;
}
