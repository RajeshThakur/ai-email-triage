import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { triageEmail } from "./triage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Tiny in-memory rate limiter: 10 requests/min per IP ---
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const hits = new Map(); // ip -> array of timestamps

function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    return res.status(429).json({
      error: "Rate limit exceeded. Max 10 requests per minute — this is a demo, be gentle."
    });
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
}

// Periodic cleanup so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of hits) {
    const recent = timestamps.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  }
}, WINDOW_MS).unref();

// --- API ---
app.post("/api/triage", rateLimit, async (req, res) => {
  try {
    const { email } = req.body || {};
    const result = await triageEmail(email);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    console.error(`[triage error] ${status}:`, err.message, err.cause?.message || "");
    res.status(status).json({
      error: status === 400 ? err.message : "Something went wrong while triaging. Please try again."
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ AI Email Triage running at http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️  OPENAI_API_KEY is not set — /api/triage calls will fail.");
  }
});
