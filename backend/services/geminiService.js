const { GoogleGenerativeAI } = require('@google/generative-ai');
const { query }              = require('../db');

/**
 * Strip markdown code fences, ```json blocks, and stray backticks that
 * models inject around JSON responses.
 */
function stripMarkdown(raw) {
  return raw.replace(/```json|```/g, '').trim();
}

/**
 * Parses multiple JSON objects concatenated together (e.g. "{a:1} {b:2}")
 * or simply extracts valid JSON objects from a text stream.
 */
function parseAllJsonObjects(str) {
  const objects = [];
  let braceCount = 0;
  let startIdx = -1;
  
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      if (braceCount === 0) {
        startIdx = i;
      }
      braceCount++;
    } else if (str[i] === '}') {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) {
        const candidate = str.slice(startIdx, i + 1);
        try {
          objects.push(JSON.parse(candidate));
        } catch (e) {
          // ignore invalid partial JSON
        }
        startIdx = -1;
      }
    }
  }
  return objects;
}

/**
 * Consolidates an array of report objects (or a single object)
 * into a single unified report object.
 */
function consolidateReports(parsed) {
  if (!parsed || parsed.length === 0) {
    return { current_health: '', risks: [], supervisor_instructions: [] };
  }
  
  if (parsed.length === 1) {
    return parsed[0];
  }
  
  const currentHealthParts = [];
  const risksSet = new Set();
  const instructionsSet = new Set();
  
  for (const obj of parsed) {
    const health = obj.current_health || obj.health_status;
    if (health) {
      currentHealthParts.push(health);
    }
    
    const risks = obj.risks || [];
    if (Array.isArray(risks)) {
      risks.forEach(r => risksSet.add(r));
    }
    
    const instructions = obj.supervisor_instructions || obj.next_steps || [];
    if (Array.isArray(instructions)) {
      instructions.forEach(s => instructionsSet.add(s));
    }
  }
  
  return {
    current_health: currentHealthParts.join('\n'),
    risks: Array.from(risksSet),
    supervisor_instructions: Array.from(instructionsSet)
  };
}

/**
 * Call Gemini with retry + model fallback.
 * Tries the primary model up to MAX_RETRIES times with exponential backoff.
 * If all attempts fail with a 503 / transient error, falls back to a
 * secondary model for one final attempt.
 */
const PRIMARY_MODEL   = 'gemini-2.5-flash';
const FALLBACK_MODEL  = 'gemini-2.0-flash';
const MAX_RETRIES     = 3;
const BASE_DELAY_MS   = 1000;

async function callGeminiWithRetry(apiKey, prompt) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // ── Try primary model with retries ─────────────────────────────
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: PRIMARY_MODEL,
        generationConfig: { temperature: 0.1 },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      const is503 = err.message?.includes('503') || err.message?.includes('overloaded') || err.message?.includes('high demand');
      console.warn(`[Gemini] ${PRIMARY_MODEL} attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (!is503 || attempt === MAX_RETRIES) break;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // ── Fallback to secondary model ────────────────────────────────
  console.warn(`[Gemini] Falling back to ${FALLBACK_MODEL}`);
  const fallback = genAI.getGenerativeModel({
    model: FALLBACK_MODEL,
    generationConfig: { temperature: 0.1 },
  });
  const result = await fallback.generateContent(prompt);
  return result.response.text();
}

// ─────────────────────────────────────────────────────────────────────────────
//  generateMasterReport  —  "The Factual Secretary"
//
//  RAG-based report generator.  Extracts ONLY what the human supervisor
//  explicitly stated in field transcripts.  No AI hallucinations allowed.
//  Output key: supervisor_instructions  (renamed from next_steps).
//
//  @param {string} farmId  UUID of the farm
//  @returns {Promise<{current_health, risks, supervisor_instructions}|null>}
// ─────────────────────────────────────────────────────────────────────────────
async function generateMasterReport(farmId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment');

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

  // ── 2. Pre-filter: skip visits with no agricultural content ──────────────
  //   If a visit has category 'General' AND contains no farm-specific terms,
  //   it is probably a test/random transcript and should NOT feed the report.
  const AGRI_SIGNAL_WORDS = [
    'farm', 'crop', 'plant', 'flower', 'field', 'soil', 'leaf', 'leaves',
    'pest', 'spray', 'fertiliz', 'irrigat', 'harvest', 'yield', 'seedling',
    'marigold', 'rose', 'carnation', 'gerbera', 'spot', 'wilt', 'rot',
    'fungus', 'aphid', 'mite', 'disease', 'blight', 'supervisor', 'visit',
  ];

  const relevantVisits = visits.filter(v => {
    const text = (v.transcript || v.notes || '').toLowerCase();
    // Always include visits explicitly categorised beyond 'General'
    if (v.category && v.category !== 'General') return true;
    // Include 'General' visits only if they contain at least one agri signal
    return AGRI_SIGNAL_WORDS.some(w => text.includes(w));
  });

  // If ALL visits are irrelevant after filtering, return a minimal report
  if (!relevantVisits.length) {
    console.warn(`[geminiService] No relevant agricultural content found for farm ${farmId} — returning minimal report.`);
    const minimalReport = {
      current_health: 'No agricultural observations have been recorded by the supervisor yet.',
      risks: [],
      supervisor_instructions: [],
    };
    const existingCheck = await query('SELECT id FROM master_reports WHERE farm_id = $1', [farmId]);
    if (existingCheck.rows.length) {
      await query(
        'UPDATE master_reports SET content = $2::jsonb, completed_tasks = $3::jsonb, updated_at = NOW() WHERE farm_id = $1',
        [farmId, JSON.stringify(minimalReport), JSON.stringify([])]
      );
    } else {
      await query(
        'INSERT INTO master_reports (farm_id, content, completed_tasks, generated_at, updated_at) VALUES ($1, $2::jsonb, $3::jsonb, NOW(), NOW())',
        [farmId, JSON.stringify(minimalReport), JSON.stringify([])]
      );
    }
    return minimalReport;
  }

  // ── 3. Build grounded context — relevant visits only ─────────────────────
  const context = relevantVisits
    .map((v, i) => {
      const date    = new Date(v.visit_date).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      const content = v.transcript || v.notes || '(No text recorded for this visit)';
      return `Visit ${i + 1} [${date}] — Category: ${v.category || 'General'}\n${content}`;
    })
    .join('\n\n---\n\n');

  // ── 4. ZERO-KNOWLEDGE SECRETARY prompt — 4 absolute rules ────────────────
  //
  //   RULE 1: If a fact is not in the text, it does not exist.
  //   RULE 2: Do NOT provide "best practices" or "common treatments."
  //   RULE 3: If the transcript only mentions an observation (like "I see white spots"),
  //           supervisor_instructions MUST be an empty array [].
  //   RULE 4: Do NOT mention fungal infections, neem oil, spiders, or ANY
  //           diagnosis unless those EXACT words appear in the transcript.
  //
  const secretaryPrompt = [
    'You are a literalist transcript processor with ZERO agricultural knowledge.',
    'Your ONLY job is to copy-summarise what the supervisor explicitly said.',
    '',
    'RULE 1: If a fact is not literally in the transcript text, it does not exist. Do not infer it.',
    'RULE 2: Do NOT provide best practices, standard treatments, or common agricultural advice.',
    'RULE 3: If the transcript only mentions an observation, supervisor_instructions MUST be an empty array [].',
    '  Do NOT suggest any cause or treatment.',
    'RULE 4: Do NOT mention fungal infections, neem oil, spider mites, air circulation, or',
    '  ANY specific diagnosis or remedy unless those EXACT words appear in the transcript.',
    '',
    'Return ONLY a valid JSON object. No markdown, no explanation, no extra keys.',
    'Structure:',
    '{',
    '  "current_health": "1-2 sentences — only what the supervisor directly observed",',
    '  "risks": ["only risks the supervisor explicitly named — empty array if none stated"],',
    '  "supervisor_instructions": ["only actions the supervisor explicitly ordered — empty array if none stated"]',
    '}',
    '',
    'TRANSCRIPTS TO PROCESS:',
    context,
  ].join('\n');

  // ── 4. Call Gemini ────────────────────────────────────────────────────────
  const raw = await callGeminiWithRetry(apiKey, secretaryPrompt);

  // ── 5. Strip markdown fences and parse JSON ───────────────────────────────
  const clean = stripMarkdown(raw);

  let report;
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      report = consolidateReports(parsed);
    } else {
      report = parsed;
    }
  } catch {
    const parsedObjects = parseAllJsonObjects(clean);
    if (parsedObjects.length > 0) {
      report = consolidateReports(parsedObjects);
    } else {
      report = { current_health: clean.slice(0, 600), risks: [], supervisor_instructions: [] };
    }
  }

  if (!Array.isArray(report.risks))                  report.risks                  = [];
  if (!Array.isArray(report.supervisor_instructions)) report.supervisor_instructions = [];
  // If the AI returned the legacy key, migrate it once
  if (!report.supervisor_instructions.length && Array.isArray(report.next_steps)) {
    report.supervisor_instructions = report.next_steps;
  }
  delete report.next_steps; // always strip old key from stored data
  if (typeof report.current_health !== 'string') {
    report.current_health = 'No information provided by supervisor.';
  }

  // ── 7. Reconcile completed_tasks against fresh supervisor_instructions ────
  //   Keep tasks farmer already completed — but ONLY if the instruction still
  //   exists in the new list.  Prune stale ones to prevent zombie tasks.
  const existing = await query(
    'SELECT completed_tasks FROM master_reports WHERE farm_id = $1',
    [farmId]
  );

  let reconciledCompleted = [];
  if (existing.rows.length) {
    const rawCompleted    = existing.rows[0].completed_tasks;
    const currentCompleted = Array.isArray(rawCompleted) ? rawCompleted : [];
    const newSet = new Set(
      report.supervisor_instructions.map(s => s.trim().toLowerCase())
    );
    reconciledCompleted = currentCompleted.filter(
      task => newSet.has(String(task).trim().toLowerCase())
    );
    const pruned = currentCompleted.length - reconciledCompleted.length;
    if (pruned > 0) {
      console.log(`[geminiService] Pruned ${pruned} stale completed_task(s) for farm ${farmId}`);
    }
  }

  // ── 8. Upsert report + reconciled completed_tasks atomically ─────────────
  await query(
    `INSERT INTO master_reports (farm_id, content, completed_tasks, generated_at, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, NOW(), NOW())
     ON CONFLICT (farm_id)
     DO UPDATE SET
       content         = EXCLUDED.content,
       completed_tasks = $3::jsonb,
       updated_at      = NOW()`,
    [farmId, JSON.stringify(report), JSON.stringify(reconciledCompleted)]
  );

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
//  consultAI  —  "The Consultant"
//
//  On-demand AI expert analysis.  Called ONLY when the supervisor explicitly
//  requests it.  Results are NEVER stored in master_reports and NEVER shown
//  to farmers or managers — supervisor eyes only.
//
//  @param {string} transcript   Raw field visit text to analyse
//  @returns {Promise<{potential_risks, suggested_treatments, notes}>}
// ─────────────────────────────────────────────────────────────────────────────
async function consultAI(transcript) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment');

  const consultPrompt = [
    'You are an expert agricultural consultant specialising in horticulture and floriculture.',
    'A field supervisor has shared the following observations from a farm visit.',
    'Based ONLY on these observations, provide expert suggestions.',
    'Clearly label everything as AI suggestions — NOT supervisor orders.',
    'Return ONLY a valid JSON object with no other text or markdown.',
    'Structure: {',
    '  "potential_risks": ["risk based on the observations"],',
    '  "suggested_treatments": ["best-practice treatment recommendations"],',
    '  "notes": "brief expert reasoning or caveats"',
    '}',
    'FIELD OBSERVATIONS:',
    transcript,
  ].join(' ');

  const raw   = await callGeminiWithRetry(apiKey, consultPrompt);
  const clean = stripMarkdown(raw);

  let advice;
  try {
    advice = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { advice = JSON.parse(match[0]); }
      catch { advice = { potential_risks: [], suggested_treatments: [], notes: clean.slice(0, 600) }; }
    } else {
      advice = { potential_risks: [], suggested_treatments: [], notes: clean.slice(0, 600) };
    }
  }

  if (!Array.isArray(advice.potential_risks))     advice.potential_risks    = [];
  if (!Array.isArray(advice.suggested_treatments)) advice.suggested_treatments = [];
  if (typeof advice.notes !== 'string')            advice.notes              = '';

  return advice;
}

// ─────────────────────────────────────────────────────────────────────────────
//  generateIncrementalReport  —  "The Checkpoint Generator"
//
//  Produces a draft report for supervisor review (NOT auto-saved).
//  Uses a checkpoint cursor (last_visit_id from saved_reports) so only
//  NEW visits since the last approved report are sent to Gemini.
//
//  Modes:
//    • Incremental — prior saved report exists → base report + new visits
//    • Full        — no saved report yet        → last 10 transcripts (same as generateMasterReport)
//
//  @param {string} farmId  UUID of the farm
//  @returns {Promise<{
//    report:              object,   // { current_health, risks, supervisor_instructions }
//    mode:                string,   // 'incremental' | 'full'
//    newVisits:           object[], // visits included in this generation
//    lastVisitId:         string|null,
//    visitCount:          number,
//    hasPriorSavedReport: boolean,
//    priorReportNumber:   number|null,
//  }|null>}
// ─────────────────────────────────────────────────────────────────────────────
async function generateIncrementalReport(farmId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment');

  // ── 1. Check for a prior saved report (our cursor) ───────────────────────
  const { rows: savedRows } = await query(
    `SELECT id, content, completed_tasks, last_visit_id, report_number
     FROM   saved_reports
     WHERE  farm_id = $1
     ORDER  BY saved_at DESC
     LIMIT  1`,
    [farmId]
  );
  const priorSaved = savedRows[0] || null;

  // ── 2. Fetch visits — strategy depends on whether cursor exists ───────────
  let visits;
  const mode = priorSaved ? 'incremental' : 'full';

  if (priorSaved && priorSaved.last_visit_id) {
    // Incremental: only visits created AFTER the cursor visit
    // We order by created_at to get a stable, insertion-order cursor.
    const cursorRow = await query(
      'SELECT created_at FROM visits WHERE id = $1',
      [priorSaved.last_visit_id]
    );
    const cursorAt = cursorRow.rows[0]?.created_at;

    if (cursorAt) {
      const { rows } = await query(
        `SELECT
           v.id, v.visit_date, v.category, v.notes, v.supervisor_notes, v.created_at,
           t.full_text AS transcript
         FROM   visits v
         LEFT JOIN transcripts t ON t.visit_id = v.id
         WHERE  v.farm_id = $1
           AND  v.created_at > $2
         ORDER  BY v.created_at ASC`,
        [farmId, cursorAt]
      );
      visits = rows;
    } else {
      // Cursor visit was deleted — fall back to full mode
      visits = null;
    }
  }

  if (!visits) {
    // Full mode: last 10 visits (same as generateMasterReport)
    const { rows } = await query(
      `SELECT
         v.id, v.visit_date, v.category, v.notes, v.supervisor_notes, v.created_at,
         t.full_text AS transcript
       FROM   visits v
       LEFT JOIN transcripts t ON t.visit_id = v.id
       WHERE  v.farm_id = $1
       ORDER  BY v.created_at DESC
       LIMIT  10`,
      [farmId]
    );
    visits = rows.reverse(); // oldest-first for context
  }

  if (!visits.length) {
    if (priorSaved) {
      return {
        report:              priorSaved.content,
        mode:                'unchanged',
        newVisits:           [],
        lastVisitId:         priorSaved.last_visit_id,
        visitCount:          0,
        hasPriorSavedReport: true,
        priorReportNumber:   priorSaved.report_number,
      };
    }
    return null;
  }

  // ── 3. Determine the last visit ID (our new cursor if saved) ─────────────
  const lastVisit = visits[visits.length - 1];
  const lastVisitId = lastVisit.id;

  // ── 4. Pre-filter: skip non-agricultural visits ──────────────────────────
  const AGRI_SIGNAL_WORDS = [
    'farm', 'crop', 'plant', 'flower', 'field', 'soil', 'leaf', 'leaves',
    'pest', 'spray', 'fertiliz', 'irrigat', 'harvest', 'yield', 'seedling',
    'marigold', 'rose', 'carnation', 'gerbera', 'spot', 'wilt', 'rot',
    'fungus', 'aphid', 'mite', 'disease', 'blight', 'supervisor', 'visit',
  ];

  const relevantVisits = visits.filter(v => {
    const text = (v.transcript || v.supervisor_notes || v.notes || '').toLowerCase();
    if (v.category && v.category !== 'General') return true;
    return AGRI_SIGNAL_WORDS.some(w => text.includes(w));
  });

  // ── 5. Build prompt ───────────────────────────────────────────────────────
  let prompt;

  if (mode === 'incremental' && relevantVisits.length > 0) {
    // Incremental prompt: carry forward prior insights + add new
    const priorContent = priorSaved.content;
    const newContext = relevantVisits
      .map((v, i) => {
        const date = new Date(v.visit_date).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
        // Option C: supervisor_notes if present, transcript excerpt as fallback
        const text = v.supervisor_notes?.trim()
          || (v.transcript || v.notes || '').slice(0, 800)
          || '(No text recorded for this visit)';
        return `New Visit ${i + 1} [${date}] — Category: ${v.category || 'General'}\n${text}`;
      })
      .join('\n\n---\n\n');

    prompt = [
      'You are a literalist transcript processor with ZERO agricultural knowledge.',
      'You will UPDATE an existing farm health report with new visit observations.',
      '',
      'RULES (absolute):',
      'RULE 1: Preserve all prior findings UNLESS a new visit explicitly contradicts them.',
      'RULE 2: Only add facts that appear literally in the new visit texts.',
      'RULE 3: Do NOT suggest diagnoses, treatments, or best practices not in the texts.',
      'RULE 4: If new visits contain no agricultural content, return the prior report unchanged.',
      '',
      'PRIOR APPROVED REPORT (carry these forward):',
      JSON.stringify(priorContent, null, 2),
      '',
      'NEW VISITS TO INCORPORATE:',
      newContext,
      '',
      'Return ONLY a valid JSON object. No markdown, no explanation.',
      'Structure: { "current_health": "string", "risks": ["array"], "supervisor_instructions": ["array"] }',
    ].join('\n');

  } else if (relevantVisits.length === 0) {
    // No new relevant content — return prior report as-is (no API call needed)
    if (priorSaved) {
      return {
        report:              priorSaved.content,
        mode:                'unchanged',
        newVisits:           visits,
        lastVisitId:         priorSaved.last_visit_id,
        visitCount:          0,
        hasPriorSavedReport: true,
        priorReportNumber:   priorSaved.report_number,
      };
    }
    // Full mode, no relevant visits at all — return minimal report
    return {
      report: {
        current_health: 'No agricultural observations have been recorded by the supervisor yet.',
        risks: [],
        supervisor_instructions: [],
      },
      mode:                'full',
      newVisits:           [],
      lastVisitId:         null,
      visitCount:          0,
      hasPriorSavedReport: false,
      priorReportNumber:   null,
    };

  } else {
    // Full mode prompt (same as generateMasterReport's secretary prompt)
    const context = relevantVisits
      .map((v, i) => {
        const date = new Date(v.visit_date).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
        const text = v.supervisor_notes?.trim()
          || v.transcript || v.notes || '(No text recorded for this visit)';
        return `Visit ${i + 1} [${date}] — Category: ${v.category || 'General'}\n${text}`;
      })
      .join('\n\n---\n\n');

    prompt = [
      'You are a literalist transcript processor with ZERO agricultural knowledge.',
      'Your ONLY job is to copy-summarise what the supervisor explicitly said.',
      '',
      'RULE 1: If a fact is not literally in the transcript text, it does not exist.',
      'RULE 2: Do NOT provide best practices, standard treatments, or common agricultural advice.',
      'RULE 3: If the transcript only mentions an observation, supervisor_instructions MUST be: "Wait for supervisor\'s physical inspection."',
      'RULE 4: Do NOT mention any diagnosis or remedy unless those EXACT words appear in the transcript.',
      '',
      'Return ONLY a valid JSON object. No markdown, no explanation, no extra keys.',
      'Structure: { "current_health": "string", "risks": ["array"], "supervisor_instructions": ["array"] }',
      '',
      'TRANSCRIPTS TO PROCESS:',
      context,
    ].join('\n');
  }

  // ── 6. Call Gemini ────────────────────────────────────────────────────────
  const raw   = await callGeminiWithRetry(apiKey, prompt);
  const clean = stripMarkdown(raw);

  let report;
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      report = consolidateReports(parsed);
    } else {
      report = parsed;
    }
  } catch {
    const parsedObjects = parseAllJsonObjects(clean);
    if (parsedObjects.length > 0) {
      report = consolidateReports(parsedObjects);
    } else {
      report = { current_health: clean.slice(0, 600), risks: [], supervisor_instructions: [] };
    }
  }

  if (!Array.isArray(report.risks))                   report.risks                  = [];
  if (!Array.isArray(report.supervisor_instructions)) report.supervisor_instructions = [];
  if (!report.supervisor_instructions.length && Array.isArray(report.next_steps)) {
    report.supervisor_instructions = report.next_steps;
  }
  delete report.next_steps;
  if (typeof report.current_health !== 'string') {
    report.current_health = 'No information provided by supervisor.';
  }

  return {
    report,
    mode,
    newVisits:           relevantVisits,
    lastVisitId,
    visitCount:          relevantVisits.length,
    hasPriorSavedReport: !!priorSaved,
    priorReportNumber:   priorSaved?.report_number ?? null,
  };
}

module.exports = { generateMasterReport, consultAI, generateIncrementalReport };

