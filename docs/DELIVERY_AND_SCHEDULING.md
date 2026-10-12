# Delivery and Scheduling

## Schedule (Vercel Cron, `vercel.json`)

| Cron (UTC) | Fires (IST) | Route | Job |
|---|---|---|---|
| `30 18 * * *` | daily, 00:00–00:59 | `/api/cron/daily` | NAVs, indices, NSE breadth, email status sync |
| `30 2 * * 6` | Saturday, 08:00–08:59 | `/api/cron/weekly` | full refresh → peers → news → Gemini report → deliveries |

Vercel Hobby limits (docs checked 2026-10-11): cron at most once per day per job; firing anywhere within the
scheduled hour; functions up to 300 s. The weekly job takes ~1–2 minutes. Times are configured in UTC and
documented in IST (`REPORT_TIMEZONE=Asia/Kolkata`); all business dates are computed in IST.

Both routes require `Authorization: Bearer $CRON_SECRET` (Vercel sends this automatically when `CRON_SECRET` is
set). The owner can also run either job from **Manage** (the weekly one asks for confirmation because it sends
real messages).

### Idempotency and run history

- `scheduled_runs` row id = `<job>_<date>` (weekly uses the week-ending Friday). Created with a conditional
  insert; a duplicate call returns `{ skipped: "already completed" | "already running" }`. A run stuck in
  `running` for >15 min is treated as crashed and may be retried (attempts counted).
  Verified on production: a second `/api/cron/daily` call returned `already completed`.
- Scheduled report id = `wk_<week-ending>`; a retry re-uses an existing report instead of generating a second one.
- Production delivery log id = `<reportId>_<channel>`; a re-run skips channels already sent. Failed or
  not-configured channels can be retried explicitly. Resend additionally receives an idempotency key.
- Each run stores per-step results and timings, shown under **Manage → Run history**.

## Channels

Each channel is independent (one failing never blocks another) and has its own `delivery_logs` row.

| Status | Meaning |
|---|---|
| `pending` | Log created, send not finished |
| `sent_to_provider` | Provider API accepted the message — **not** proof of delivery |
| `delivered` | Provider confirmed delivery (Resend `last_event`, WhatsApp webhook) |
| `read` | Opened/read (Resend opened/clicked; WhatsApp read receipt) |
| `failed` | Provider rejected, bounced, or errored (message stored) |
| `awaiting_configuration` | Credentials/consent missing — nothing was sent |

Test sends (report page → owner only, or `scripts/send-test.ts`) get a fresh `t_<ts>_<channel>` log, have
`[TEST]`/🧪 in the message, and are marked "test" in the delivery list.

### Email — Resend

- HTML (table layout, inline styles, all dynamic text escaped) + plain-text alternative; link to the full report.
- Env: `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `REPORT_EMAIL_TO`.
- Constraint: the Resend domain `pg27.mesaschool.co` shows verification **failed**, so mail is sent from
  `onboarding@resend.dev`, which Resend only allows to the account owner's address. To send to anyone else,
  verify a domain you control (DNS records in Resend → Domains) and change `REPORT_EMAIL_FROM`.
- Status: `syncEmailStatuses` reads Resend's `last_event` (daily job and when a report page is opened).
- Verified 2026-10-11: test email accepted by Resend and later reported **delivered** (`last_event: delivered`).

### Telegram — Bot API (interim messaging channel)

- Two messages: (1) an HTML insights message — the verdict, key insights computed from the report's numbers (the flagged fund and both gaps, a market-wide dip, a fund behind only this year and why it is not flagged, best/slowest this week), up to three headlines the report cited as evidence, and a link to the detailed report; (2) the full report as a PDF (`sendDocument` with the public `/api/reports/<id>/pdf` link), which carries the three sentences per fund and the closing assessment. If the PDF cannot be attached, the insights message still stands.
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Setup: in Telegram open **@BotFather** → `/newbot` → copy the token into `.env.local` and Vercel; open your new
  bot and send `/start`; run `npx tsx --env-file=.env.local scripts/telegram-chat-id.ts` to print your chat id.
- Bots get no delivery/read receipts, so Telegram stays at `sent_to_provider` (Telegram's servers accepted it).

### WhatsApp — official Business Cloud API

Implemented (`sendWhatsApp`, `/api/webhooks/whatsapp`) and reporting `awaiting_configuration` until set up.

- Business-initiated messages outside a 24-hour customer-service window must use an **approved template**.
- **Key insights + PDF** (preferred, 2026-10-12): template `weekly_fund_report_pdf_v2` (`WHATSAPP_PDF_TEMPLATE_NAME`,
  id 1107932945503229) attaches the PDF and puts the key insights in the message itself — the overall verdict with
  its reason, one line per fund for the week (e.g. "🚀 HDFC Mid Cap +0.17% (slightly ahead of similar funds)") and
  the market in a sentence or two — sized to stay under WhatsApp's 1,024-character body limit (`whatsappPdfParams`).
  Senders try this, then the short PDF template (`WHATSAPP_PDF_TEMPLATE_SHORT`), then the text template.
- **Short PDF template**: `weekly_fund_report_pdf` has a
  DOCUMENT header, filled with the report's public PDF link `/api/reports/<id>/pdf` — the same content and order as
  the email: three sentences per fund, the market, then the closing overall assessment. Body:
  `Hi {{1}}, your weekly mutual fund report for the week ending {{2}} is attached as a PDF. Overall: {{3}}. Full report with sources: {{4}} (monitoring summary, not investment advice).`
  Submitted via the Graph API on 2026-10-11 (template id 1801939720898003; the sample PDF was uploaded with the
  Resumable Upload API to obtain the header example handle).
- **Fallback**: a template body is capped at about 1,024 characters, so the full text cannot go in the message itself.
  Until the PDF template is approved, Meta rejects it (codes 132000–132016 — nothing is sent) and the sender
  falls back to `weekly_fund_report` (`WHATSAPP_TEMPLATE_NAME`), the same body without the attachment, ending with
  the report link. Any other error is not retried, so there is never a duplicate message.
  ({{3}} = label + reason). Parameters are cleaned of newlines/tabs as required by the API.
- No automatic retries on WhatsApp sends (a timeout after Meta accepted would duplicate the message); retry is an
  explicit owner action.
- Consent: sends are refused unless `WHATSAPP_RECIPIENT_OPTED_IN=yes` is set, recording that the recipient opted in.
- Status: Meta calls `/api/webhooks/whatsapp` with sent/delivered/read/failed; the signature
  (`X-Hub-Signature-256`, HMAC-SHA256 with the app secret) is verified, and statuses never move backwards.

Setup steps (owner):
1. developers.facebook.com → create an app (type Business) → add **WhatsApp**. Note the test number's
   **Phone number ID** and **WhatsApp Business Account ID**.
2. Add your own number as a recipient and verify it with the code Meta sends.
3. Create a permanent token: Business Settings → System users → add → assign the app with
   `whatsapp_business_messaging` → generate token.
4. WhatsApp Manager → Message templates → create **Utility** template `weekly_fund_report` (language English)
   with the body above → wait for approval.
5. Set env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
   `WHATSAPP_RECIPIENT_NUMBER` (e.g. 91XXXXXXXXXX), `WHATSAPP_TEMPLATE_NAME=weekly_fund_report`,
   `WHATSAPP_TEMPLATE_LANGUAGE` (must match the template, e.g. `en` or `en_US`), `WHATSAPP_GRAPH_VERSION` (as shown
   in the app dashboard), `WHATSAPP_RECIPIENT_OPTED_IN=yes`.
6. Webhook (optional, for delivered/read): App → WhatsApp → Configuration → callback
   `https://financial-intelligence-agent-lake.vercel.app/api/webhooks/whatsapp`, verify token =
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; subscribe to `messages`; set `WHATSAPP_APP_SECRET`.
7. Send a test from the report page.

## Troubleshooting

| Symptom | Where to look / fix |
|---|---|
| Run shows `partial` | Manage → Run history → the ✗ step's message |
| Email `failed` "You can only send testing emails…" | Recipient is not the Resend account owner; verify a domain |
| WhatsApp code 131030 (recipient not allowed) | Add/verify the recipient number in the Meta app |
| WhatsApp code 132001 (template does not exist) | Template name/language mismatch or not approved yet |
| Smallcap 100 missing | NSE blocked the request — check Vercel region is `bom1`; data is shown as unavailable, not substituted |
| Report says "automated summary" | Gemini failed 3× — meta.validationErrors on the report row explains why |
