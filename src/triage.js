import OpenAI from "openai";

const client = new OpenAI(); // reads OPENAI_API_KEY from env

const SYSTEM_PROMPT = `You are a senior customer support triage assistant for a SaaS company.

Your job: analyze an incoming customer email and produce structured triage data.

Rules:
- Never invent facts about the company, its products, or its policies.
- The suggested_reply must be professional, empathetic, and 2-4 sentences. It should acknowledge the customer's issue and state a clear next step, without promising anything specific (no refund amounts, no dates, no policy claims).
- urgency is "critical" ONLY for: confirmed data loss, security breaches, exposure of other users' data, or payment failures blocking business operations.
- A single customer threatening a chargeback, bank dispute, or public complaint is "high", not "critical". That is one unhappy customer, not a business-wide emergency.
- Customer anger never raises urgency by itself. Urgency measures business impact and time-sensitivity, not emotional tone. A furious billing complaint is "high"; a calm note that all logins are failing company-wide is "critical".
- If the email is not a genuine customer message (marketing blast, gibberish, abuse with no support request), classify intent as "spam" and keep the reply brief and neutral.
- confidence reflects how certain you are about the intent classification (0.0 to 1.0).
- summary is exactly one sentence describing what the customer wants.`;

const TRIAGE_SCHEMA = {
  name: "email_triage",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: [
          "refund_request",
          "technical_issue",
          "billing_question",
          "feature_request",
          "complaint",
          "general_inquiry",
          "spam"
        ],
        description: "Primary intent of the customer email"
      },
      urgency: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
        description: "How urgently this needs human attention"
      },
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "frustrated", "angry"],
        description: "Emotional tone of the customer"
      },
      category: {
        type: "string",
        description: "Suggested department routing, e.g. 'Billing', 'Tech Support L2', 'Product'"
      },
      summary: {
        type: "string",
        description: "One sentence summary of what the customer wants"
      },
      suggested_reply: {
        type: "string",
        description: "Professional draft reply, 2-4 sentences"
      },
      confidence: {
        type: "number",
        description: "Confidence in the intent classification, 0.0 to 1.0"
      }
    },
    required: [
      "intent",
      "urgency",
      "sentiment",
      "category",
      "summary",
      "suggested_reply",
      "confidence"
    ],
    additionalProperties: false
  }
};

const MAX_EMAIL_CHARS = 8000; // ~2000 tokens, keeps cost + latency predictable

/**
 * Triage a raw customer email into structured data.
 * @param {string} emailText
 * @returns {Promise<object>} triage result matching TRIAGE_SCHEMA
 */
export async function triageEmail(emailText) {
  if (!emailText || typeof emailText !== "string" || !emailText.trim()) {
    const err = new Error("Email text is required.");
    err.status = 400;
    throw err;
  }

  // Truncate very long emails instead of failing — note it for the model.
  let text = emailText.trim();
  let truncated = false;
  if (text.length > MAX_EMAIL_CHARS) {
    text = text.slice(0, MAX_EMAIL_CHARS);
    truncated = true;
  }

  const userContent = truncated
    ? `${text}\n\n[NOTE: email truncated at ${MAX_EMAIL_CHARS} characters]`
    : text;

  // One retry on transient failures / malformed output.
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0, // classification must be deterministic
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
        response_format: {
          type: "json_schema",
          json_schema: TRIAGE_SCHEMA
        }
      });

      const raw = completion.choices[0]?.message?.content;
      const result = JSON.parse(raw); // schema mode should guarantee validity; parse defensively anyway

      // Attach usage metadata — nice for the demo UI and cost transparency.
      result._meta = {
        model: completion.model,
        prompt_tokens: completion.usage?.prompt_tokens ?? null,
        completion_tokens: completion.usage?.completion_tokens ?? null,
        truncated
      };

      return result;
    } catch (err) {
      lastError = err;
      // 400-level errors from our own validation shouldn't retry
      if (err.status && err.status < 500 && attempt === 1 && !(err instanceof SyntaxError)) {
        throw err;
      }
    }
  }

  const err = new Error("Triage failed after retry. Please try again.");
  err.status = 502;
  err.cause = lastError;
  throw err;
}
