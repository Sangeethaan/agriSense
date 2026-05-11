const axios     = require('axios');
const { query } = require('../db');

const SARVAM_LLM_URL = 'https://api.sarvam.ai/v1/chat/completions';

/**
 * generateMasterReport
 *
 * RAG-based master report generator: fetches the last 10 visit transcripts
 * for a farm, injects them as grounded context, and calls Sarvam LLM.
 * The model is instructed never to hallucinate — every claim must appear
 * in the provided transcripts.
 *
 * @param {string} farmId  UUID of the farm
 * @returns {Promise<{summary, detected_risks, next_steps}|null>}
 */
async function generateMasterReport(farmId) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY is not set in environment');

  // ── 1. Retrieve last 10 visits with transcripts (RAG context) ────────────
  const { rows: visits } = await query(
    `SELECT
       v.visit_date,
       v.category,
       v.notes,
       t.full_text AS transcript
     FROM   visits v
     LEFT JOIN transcripts t ON t.visit_id = v.id
     WHERE  v.farm_id = $1
     ORDER  BY v.visit_date DESC, v.created_at DESC
     LIMIT  10`,
    [farmId]
  );

  if (!visits.length) return null;

  // ── 2. Build grounded context block ─────────────────────────────────────
  const context = visits
    .map((v, i) => {
      const date    = new Date(v.visit_date).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      const content = v.transcript || v.notes || '(No text recorded for this visit)';
      return `Visit ${i + 1} [${date}] — Category: ${v.category || 'General'}\n${content}`;
    })
    .join('\n\n---\n\n');

  // ── 3. Prompt engineering ────────────────────────────────────────────────
  const systemPrompt =
    'You are an expert floriculture field analyst specialising in high-value flower crops ' +
    'such as roses, jasmine, and other essential-oil-bearing plants. ' +
    'Your sole task is to synthesise raw field-visit transcripts into a structured farm health report ' +
    'for a field supervisor. ' +
    'Focus on floriculture-specific metrics: flower bud health, pest and disease impact on bloom quality, ' +
    'essential oil yield risks, petal drop, and post-harvest readiness. ' +
    'Exclude all internal reasoning, <think> tags, or conversational fillers from your response. ' +
    'Return ONLY the structured report for the supervisor — no preamble, no explanation, no sign-off. ' +
    'Respond with valid JSON only. Do not wrap the JSON in markdown code fences.';

  const userPrompt =
    'Context: Below are raw transcripts from field visits to a farm.\n\n' +
    `${context}\n\n` +
    'Task: Generate a structured Master Report covering:\n' +
    '1. summary — A 2-3 sentence overview of current crop health, bloom stage, and farm status.\n' +
    '2. detected_risks — An array of specific recurring issues or risks identified, ' +
    'including any threats to flower quality, pest infestations, or oil-yield impact (strings).\n' +
    '3. next_steps — An array of concrete, actionable next steps the supervisor should take, ' +
    'including spray schedules, cultural practices, or harvest timing recommendations (strings).\n\n' +
    'Constraint: Use ONLY the provided context. Do NOT hallucinate. ' +
    'If an area was not mentioned in any visit, omit it entirely. ' +
    'If there is insufficient data, set summary to "No data reported" and use empty arrays for lists.\n\n' +
    'Respond with ONLY this JSON structure:\n' +
    '{\n  "summary": "...",\n  "detected_risks": ["..."],\n  "next_steps": ["..."]\n}';

  // ── 4. Call Sarvam LLM ───────────────────────────────────────────────────
  const response = await axios.post(
    SARVAM_LLM_URL,
    {
      model: 'sarvam-m',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.1, // Low temperature — factual, grounded output
    },
    {
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    }
  );

  // ── 5. Parse response — strip optional markdown fences ──────────────────
  const raw     = response.data.choices[0].message.content.trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();

  let report;
  try {
    report = JSON.parse(jsonStr);
  } catch {
    // Graceful degradation: surface raw text rather than crashing
    report = { summary: raw.slice(0, 600), detected_risks: [], next_steps: [] };
  }

  // ── 6. Upsert into master_reports ────────────────────────────────────────
  const { rows: existing } = await query(
    'SELECT id FROM master_reports WHERE farm_id = $1',
    [farmId]
  );

  if (existing.length) {
    await query(
      'UPDATE master_reports SET content = $1, updated_at = NOW() WHERE farm_id = $2',
      [report, farmId]
    );
  } else {
    await query(
      'INSERT INTO master_reports (farm_id, content, generated_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
      [farmId, report]
    );
  }

  return report;
}

module.exports = { generateMasterReport };
