# AI Email Triage

Paste a raw customer support email → get instant structured triage: **intent, urgency, sentiment, department routing, one-line summary, and a suggested reply draft** — powered by OpenAI structured outputs.

> Built as a production-pattern demo of LLM workflow automation: the single most requested AI use case for SMB support teams.

**Live demo:** https://ai-email-triage-stlr.onrender.com

## What it does

| Input          | Output                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Raw email text | `intent` — refund_request / technical_issue / billing_question / feature_request / complaint / general_inquiry / spam |
|                | `urgency` — low / medium / high / critical                                                                            |
|                | `sentiment` — positive / neutral / frustrated / angry                                                                 |
|                | `category` — suggested department routing                                                                             |
|                | `summary` — one-sentence summary                                                                                      |
|                | `suggested_reply` — professional 2-4 sentence draft                                                                   |
|                | `confidence` — classification confidence 0-1                                                                          |

## Architecture

```
public/index.html   →  vanilla JS UI (no build step)
src/server.js       →  Express: static hosting + POST /api/triage + rate limiting
src/triage.js       →  prompt design, OpenAI call, schema enforcement, retry logic
```

Deliberately simple: one endpoint, no database, no framework overhead. The engineering lives in the **prompt design and structured output handling**.

## Design decisions

- **`temperature: 0`** — triage is classification; identical emails must yield identical results. Determinism beats creativity here.
- **OpenAI structured outputs (`json_schema`, strict mode)** — guarantees parseable, schema-valid JSON. No regex extraction, no "please respond in JSON" hope.
- **`gpt-4o-mini`** — triage doesn't need a frontier model. Cost per email: ~$0.0005–0.002. At 1,000 emails/day this stays under $2/day.
- **Guarded urgency** — the system prompt restricts `critical` to data loss, security, payment-blocking, and legal threats. Without this constraint the model over-flags angry-but-routine emails as critical.
- **Input truncation at 8K chars** — predictable latency and cost; the model is told when truncation occurred.
- **One retry, then fail loud** — transient API hiccups are retried once; persistent failures return a clean 502 rather than fake data.
- **In-memory rate limiting (10 req/min/IP)** — protects the demo's API budget. Production would use Redis.
- **Cancellation requests** classify as `general_inquiry/low` — teams wanting explicit churn-signal routing should extend the intent enum with `cancellation_request`.
- **GDPR/legal data requests** route automatically to Legal Compliance at medium urgency — the 30-day statutory window is correctly not treated as critical.
- **Content-free messages** ("hi") classify as spam since they contain no actionable request. Teams preferring `general_inquiry` for incomplete messages can adjust the spam definition in the system prompt.

## Run locally

```bash
git clone https://github.com/RajeshThakur/ai-email-triage.git
cd ai-email-triage
npm install
cp .env.example .env   # add your OpenAI API key
npm run dev
# open http://localhost:3000
```

`.env`:

```
OPENAI_API_KEY=sk-...
PORT=3000
```

## Production considerations (what v2 would add)

- Queue-based processing for inbox-scale volume (BullMQ / SQS)
- Webhook ingestion from Gmail / Zendesk / Front instead of manual paste
- Human-in-the-loop review queue for `critical` and low-confidence results
- Per-tenant prompt customization (company tone, policies, product names)
- Evaluation harness with labeled test set to measure classification accuracy over time

## Known limitations / design notes:

- Single-word or content-free messages ("hi") are classified as spam since they contain no actionable request. Teams that prefer to treat these as incomplete inquiries (and auto-prompt for detail) can adjust the spam definition in the system prompt — the suggested reply already handles this case gracefully.
- Cancellations classify as general_inquiry/low — teams wanting churn-flag routing should extend the intent enum with a `cancellation_request` type.
- GDPR and formal data requests route correctly to Legal Compliance at medium urgency — the 30-day statutory window is correctly not treated as critical.
- "Demo may take ~30 seconds to wake on first load (free tier).

## Author

**Rajesh Thakur** — Senior Backend & AI Integration Engineer · 10+ years
[LinkedIn](https://www.linkedin.com/in/rt2786) · [GitHub](https://github.com/RajeshThakur)

Previously shipped [storygeniebooks.com](https://storygeniebooks.com) — production AI storybook platform (OpenAI + Midjourney + Leonardo.ai + print-on-demand fulfillment).
