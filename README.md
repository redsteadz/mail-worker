# Budget Mail Worker

A Cloudflare Worker that converts bank transaction emails into transactions in the [Nextcloud Budget app](https://github.com/nextcloud/budget).

The worker currently supports selected Meezan Bank credit and debit alerts. Known formats are parsed locally; an explicitly enabled Gemini fallback can handle unrecognized Meezan formats.

## How it works

1. Cloudflare Email Routing delivers mail from an allowed Meezan domain.
2. The Worker stores the raw message in D1 and queues its ID.
3. The queue consumer parses, normalizes, and maps the masked account hint.
4. D1 import IDs and a Budget API lookup prevent duplicate transactions.
5. Retryable failures use scheduled exponential backoff with a fixed attempt limit.
6. Terminal raw messages are automatically redacted after the configured retention period.

## Features

- Deterministic credit, fund-transfer debit, and RAAST debit parsers
- Optional, explicit Gemini structured-extraction fallback
- D1-backed account mappings, failures, idempotency, and retry state
- Queue-based processing with cached parse results
- Duplicate checks before transaction creation
- Authenticated administrative replay endpoint
- Retention-based removal of stored email content and addresses
- Tests for parsing, sender validation, configuration, retries, caching, and retention

## Requirements

- Node.js 22 or later
- Cloudflare Workers, Email Routing, D1, and Queues
- Nextcloud with the Budget app
- A dedicated Nextcloud app password
- Optional: a Gemini API key

## Setup

~~~bash
git clone https://github.com/redsteadz/budget-mail-worker.git
cd budget-mail-worker
npm install
cp wrangler.toml.example wrangler.toml
~~~

Create the resources:

~~~bash
npx wrangler d1 create budget-email-ingestion
npx wrangler queues create budget-email-ingestion
npx wrangler queues create budget-email-ingestion-dlq
~~~

Replace the placeholder D1 ID in the untracked `wrangler.toml`, then migrate:

~~~bash
npm run d1:migrate:remote
~~~

Configure secrets:

~~~bash
npx wrangler secret put NEXTCLOUD_BASE_URL
npx wrangler secret put BUDGET_USERNAME
npx wrangler secret put BUDGET_APP_PASSWORD
npx wrangler secret put ADMIN_REPLAY_TOKEN
~~~

For Gemini fallback, also set the key and explicitly enable it in `wrangler.toml`:

~~~bash
npx wrangler secret put GEMINI_API_KEY
~~~

~~~toml
ENABLE_GEMINI_FALLBACK = "true"
~~~

Add an account mapping using only your own masked account hint:

~~~bash
npx wrangler d1 execute budget-email-ingestion --remote \
  --command "INSERT INTO account_mappings (account_hint, account_id, label) VALUES ('xxx0001', 1, 'Primary account')"
~~~

Configure a narrow Email Routing rule for the intended bank-alert mailbox, then deploy:

~~~bash
npm run deploy
~~~

## Configuration

| Setting | Purpose |
| --- | --- |
| `NEXTCLOUD_BASE_URL` | HTTPS URL of the Nextcloud instance |
| `BUDGET_USERNAME` | Nextcloud user that owns the Budget data |
| `BUDGET_APP_PASSWORD` | Dedicated Nextcloud app password |
| `ADMIN_REPLAY_TOKEN` | Bearer token for administrative replay |
| `ENABLE_GEMINI_FALLBACK` | Must be `true` before emails are sent to Gemini |
| `GEMINI_API_KEY` | Gemini credential; optional |
| `GEMINI_MODEL` | Gemini model name |
| `ALLOW_DEFAULT_ACCOUNT` | Allows fallback when no D1 mapping exists |
| `BUDGET_DEFAULT_ACCOUNT_ID` | Fallback Budget account ID |
| `CONFIDENCE_THRESHOLD` | Minimum extraction confidence |
| `DEDUPE_WINDOW_DAYS` | Date range used for duplicate checks |
| `MAX_RETRY_ATTEMPTS` | Total processing attempts before failure |
| `RAW_EMAIL_RETENTION_DAYS` | Days before terminal raw messages are redacted |

Default-account and Gemini fallbacks are disabled by default.

## Endpoints

- `GET /health`
- `POST /admin/replay` with `Authorization: Bearer <ADMIN_REPLAY_TOKEN>`

## Development

Copy `.env.example` to the ignored `.env` only for local scripts. Use synthetic transactions and a development Budget account.

~~~bash
npm test
npm run typecheck
npm run dev
~~~

## Privacy and security

- Raw email is temporarily stored in D1 because queued processing and replay require it.
- Terminal messages have addresses, subject, message ID, raw content, cached extraction, and error detail redacted after `RAW_EMAIL_RETENTION_DAYS`.
- Gemini receives the email subject, sender, and body only when both its key and explicit enable flag are present.
- Envelope senders must use the Meezan domain or a subdomain. This is a filtering control, not cryptographic sender verification.
- Logs contain internal raw-message IDs and processing state, not sender or recipient addresses.
- Nextcloud URLs must use HTTPS.
- Live `wrangler.toml`, local variables, and Wrangler state are ignored.
- Never commit real financial messages or deployment identifiers.

## Limitations

- Only selected Meezan formats are supported.
- MIME parsing is intentionally lightweight.
- The integration depends on the current Nextcloud Budget transaction API.
- Sender-domain filtering does not replace SPF, DKIM, DMARC, or narrow Email Routing rules.
- Manual review currently occurs through D1 rather than a dedicated UI.

## License

[MIT](LICENSE)
