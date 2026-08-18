import type { ParsedEmail } from "../types";

export function parseEmail(raw: string): ParsedEmail {
  const normalized = raw.replace(/\r\n/g, "\n");
  const splitAt = normalized.indexOf("\n\n");
  const headerBlock = splitAt >= 0 ? normalized.slice(0, splitAt) : "";
  const body = splitAt >= 0 ? normalized.slice(splitAt + 2) : normalized;
  const headers = parseHeaders(headerBlock);
  const text = extractText(body, headers["content-type"] || "");
  return { headers, text: decodeMimeWords(text).trim() };
}

function parseHeaders(input: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let current = "";
  for (const line of input.split("\n")) {
    if (/^\s/.test(line)) {
      current += ` ${line.trim()}`;
      continue;
    }
    if (current) addHeader(headers, current);
    current = line;
  }
  if (current) addHeader(headers, current);
  return headers;
}

function addHeader(headers: Record<string, string>, line: string): void {
  const index = line.indexOf(":");
  if (index < 0) return;
  headers[line.slice(0, index).trim().toLowerCase()] = decodeMimeWords(line.slice(index + 1).trim());
}

function extractText(body: string, contentType: string): string {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`);
    const textPart = parts.find((part) => /content-type:\s*text\/plain/i.test(part));
    if (textPart) return decodeBody(stripPartHeaders(textPart));
  }

  if (/text\/html/i.test(contentType)) {
    return stripHtml(decodeBody(body));
  }

  return decodeBody(body);
}

function stripPartHeaders(part: string): string {
  const normalized = part.replace(/\r\n/g, "\n");
  const splitAt = normalized.indexOf("\n\n");
  return splitAt >= 0 ? normalized.slice(splitAt + 2) : normalized;
}

function decodeBody(input: string): string {
  return input
    .replace(/=\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .trim();
}

function stripHtml(input: string): string {
  return input.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
}

function decodeMimeWords(input: string): string {
  return input.replace(/=\?utf-8\?q\?([^?]+)\?=/gi, (_, encoded: string) =>
    encoded.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
  );
}
