// Measures email-classification accuracy against a hand-labeled set of real
// emails, using the EXACT production prompt and decision logic from
// src/lib/actions/gmail.ts (extracted from the source at runtime so there is
// a single source of truth — if the prompt changes, the eval reflects it).
//
// This intentionally makes real OpenAI calls (it is an eval, not a test —
// the vitest suite must never do this). Cost: one gpt-4o-mini call per email.
//
// Usage:
//   1. Copy scripts/eval-emails.example.json to scripts/eval-emails.json
//   2. Fill it with ~50 real emails from your inbox and your hand labels
//   3. node scripts/eval-classifier.mjs [path-to-labels.json]
//
// Reports:
//   - Relevance accuracy: did the pipeline correctly decide "this email
//     becomes a suggestion" vs "this email is ignored"? (matches production
//     gating: action is NEW_APPLICATION/STATUS_UPDATE AND confidence >= MIN_CONFIDENCE)
//   - Action accuracy: exact 3-way match of the raw classified action
//   - Every mismatch, with the model's confidence and reasoning
// Results are also written to scripts/eval-results.json so the numbers are
// on record with a timestamp and sample size.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import OpenAI from "openai";
import pLimit from "p-limit";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env") });

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. Add it to .env first.");
  process.exit(1);
}

// ── Extract the production prompt + threshold from gmail.ts ────────────────
const gmailSource = readFileSync(
  resolve(root, "src/lib/actions/gmail.ts"),
  "utf-8"
);
const promptMatch = gmailSource.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
const thresholdMatch = gmailSource.match(/const MIN_CONFIDENCE = ([\d.]+)/);
if (!promptMatch || !thresholdMatch) {
  console.error(
    "Could not extract SYSTEM_PROMPT / MIN_CONFIDENCE from src/lib/actions/gmail.ts — has the file been refactored?"
  );
  process.exit(1);
}
const SYSTEM_PROMPT = promptMatch[1];
const MIN_CONFIDENCE = Number(thresholdMatch[1]);

// ── Load labels ─────────────────────────────────────────────────────────────
const labelsPath = resolve(
  root,
  process.argv[2] ?? "scripts/eval-emails.json"
);
let emails;
try {
  emails = JSON.parse(readFileSync(labelsPath, "utf-8"));
} catch (err) {
  console.error(`Could not read labels file at ${labelsPath}`);
  console.error(
    "Copy scripts/eval-emails.example.json to scripts/eval-emails.json and fill it with labeled emails."
  );
  process.exit(1);
}

const VALID_ACTIONS = ["NEW_APPLICATION", "STATUS_UPDATE", "IRRELEVANT"];
for (const [i, e] of emails.entries()) {
  if (!e.subject || !e.from || !VALID_ACTIONS.includes(e.label?.action)) {
    console.error(
      `Entry ${i + 1} is invalid: needs subject, from, and label.action one of ${VALID_ACTIONS.join(", ")}`
    );
    process.exit(1);
  }
}

console.log(`Evaluating ${emails.length} labeled emails (threshold ${MIN_CONFIDENCE})...`);

// ── Classify with the production logic ─────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const limit = pLimit(5);

const results = await Promise.all(
  emails.map((email, index) =>
    limit(async () => {
      // identical construction to syncGmailEmails in gmail.ts
      const emailText = `Subject: ${email.subject}\nFrom: ${email.from}\nSnippet: ${email.snippet ?? ""}\n\nBody:\n${(email.body ?? "").slice(0, 2000)}`;

      let classification;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: emailText },
          ],
        });
        classification = JSON.parse(completion.choices[0].message.content ?? "{}");
      } catch (err) {
        // production silently skips on error; for the eval, record it
        classification = { action: "ERROR", confidence: 0, reasoning: String(err) };
      }

      const confidence = Math.min(1, Math.max(0, classification.confidence ?? 0));
      // production gating: only these become suggestions
      const predictedRelevant =
        ["NEW_APPLICATION", "STATUS_UPDATE"].includes(classification.action) &&
        confidence >= MIN_CONFIDENCE;
      const expectedRelevant = email.label.action !== "IRRELEVANT";

      return {
        index: index + 1,
        subject: email.subject,
        expected: email.label.action,
        predicted: classification.action,
        confidence,
        reasoning: classification.reasoning ?? null,
        expectedRelevant,
        predictedRelevant,
        relevanceCorrect: predictedRelevant === expectedRelevant,
        actionCorrect: classification.action === email.label.action,
      };
    })
  )
);

// ── Report ──────────────────────────────────────────────────────────────────
const n = results.length;
const relevanceCorrect = results.filter((r) => r.relevanceCorrect).length;
const actionCorrect = results.filter((r) => r.actionCorrect).length;
const truePos = results.filter((r) => r.predictedRelevant && r.expectedRelevant).length;
const falsePos = results.filter((r) => r.predictedRelevant && !r.expectedRelevant).length;
const falseNeg = results.filter((r) => !r.predictedRelevant && r.expectedRelevant).length;

const pct = (x, total) => `${((x / total) * 100).toFixed(1)}%`;

console.log("\n=== Results ===");
console.log(`Relevance accuracy: ${relevanceCorrect}/${n} (${pct(relevanceCorrect, n)})`);
console.log(`Exact action accuracy: ${actionCorrect}/${n} (${pct(actionCorrect, n)})`);
if (truePos + falsePos > 0)
  console.log(`Relevant precision: ${pct(truePos, truePos + falsePos)} (${falsePos} false positives)`);
if (truePos + falseNeg > 0)
  console.log(`Relevant recall: ${pct(truePos, truePos + falseNeg)} (${falseNeg} missed relevant emails)`);

const mismatches = results.filter((r) => !r.relevanceCorrect || !r.actionCorrect);
if (mismatches.length > 0) {
  console.log("\n=== Mismatches ===");
  for (const m of mismatches) {
    console.log(
      `#${m.index} "${m.subject}"\n  expected ${m.expected}, got ${m.predicted} (confidence ${m.confidence.toFixed(2)})\n  reasoning: ${m.reasoning}`
    );
  }
}

const outPath = resolve(root, "scripts/eval-results.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      evaluatedAt: new Date().toISOString(),
      sampleSize: n,
      minConfidence: MIN_CONFIDENCE,
      relevanceAccuracy: relevanceCorrect / n,
      actionAccuracy: actionCorrect / n,
      results,
    },
    null,
    2
  )
);
console.log(`\nFull results written to ${outPath}`);
