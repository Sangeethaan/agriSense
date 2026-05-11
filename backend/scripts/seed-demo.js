/**
 * seed-demo.js
 * Injects the Shivam's Rose Plantation demo scenario into the database.
 * Idempotent — safe to run multiple times.
 *
 * Usage (from project root):
 *   node backend/scripts/seed-demo.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt        = require('bcryptjs');
const { query, pool } = require('../db');

// ─── Demo data ────────────────────────────────────────────────────────────────

const FARMER = {
  name:  'Shivam',
  email: 'shivam@demo.agrisense',
  password: 'demo1234',
  village: 'Nashik',
  phone:   '+91-9000000001',
};

const FARM = {
  name:       'Rose Plantation - Plot B',
  location:   'Nashik, Maharashtra',
  crop_types: ['Damascus Rose'],
};

const VISITS = [
  {
    date:     '2026-04-18',
    category: 'Crop Health',
    notes:    'Early bronzing on leaf undersides in eastern corner. Possible Red Spider Mite onset due to rising heat. Soil moisture adequate.',
    transcript:
      "Visiting Shivam's rose plot. The Damascus roses are in the budding stage. " +
      "I noticed some bronzing on the underside of the leaves in the eastern corner. " +
      "Could be the start of a Red Spider Mite issue due to the rising heat. " +
      "Soil moisture is adequate for now.",
  },
  {
    date:     '2026-04-19',
    category: 'Pesticide',   // 'Disease' is not in the ENUM; Pesticide is the closest valid value
    notes:    'Bronzing spread significantly. Fine webbing on stems confirmed Red Mite infestation. Instructed Shivam to mist and prepare Abamectin spray.',
    transcript:
      "Second visit. The bronzing has spread significantly. I see fine webbing on the stems now. " +
      "It is definitely a Red Mite infestation. This will severely impact the essential oil content " +
      "if the leaves drop. I've instructed Shivam to increase humidity by misting and to prepare an " +
      "Abamectin spray.",
  },
  {
    date:     '2026-04-20',
    category: 'Pesticide',
    notes:    'First round of miticide spray complete. Weeds cleared. New buds unaffected. Continue regime 5 more days ahead of harvest.',
    transcript:
      "Shivam has completed the first round of miticide spray. We've also cleaned the surrounding " +
      "weeds to prevent further breeding. The new buds look unaffected. We need to maintain this " +
      "regime for 5 more days to ensure the flower quality for the upcoming harvest.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  ${msg}`); }
function ok(msg)  { console.log(`  ✅ ${msg}`); }
function skip(msg){ console.log(`  ⏭  ${msg} (already exists)`); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌹 AgriSense Demo Seed — Shivam\'s Rose Plantation\n');

  // ── 1. Ensure a supervisor exists to act as staff ────────────────────────
  let staffId;
  const supRes = await query("SELECT id FROM users WHERE role = 'supervisor' LIMIT 1");
  if (supRes.rows.length) {
    staffId = supRes.rows[0].id;
    log(`Using existing supervisor as staff: ${staffId}`);
  } else {
    // Create a demo supervisor if none exists at all
    const hash = await bcrypt.hash('demo1234', 10);
    const sup  = await query(
      `INSERT INTO users (name, email, password_hash, role, village, phone)
       VALUES ($1, $2, $3, 'supervisor', 'Nashik HQ', '+91-9000000000')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['Demo Supervisor', 'supervisor@demo.agrisense', hash]
    );
    staffId = sup.rows[0].id;
    ok(`Created demo supervisor: ${staffId}`);
  }

  // ── 2. Create farmer Shivam ───────────────────────────────────────────────
  let farmerId;
  const existingFarmer = await query('SELECT id FROM users WHERE email = $1', [FARMER.email]);

  if (existingFarmer.rows.length) {
    farmerId = existingFarmer.rows[0].id;
    skip(`Farmer Shivam (${farmerId})`);
  } else {
    const hash   = await bcrypt.hash(FARMER.password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, village, phone)
       VALUES ($1, $2, $3, 'farmer', $4, $5)
       RETURNING id`,
      [FARMER.name, FARMER.email, hash, FARMER.village, FARMER.phone]
    );
    farmerId = result.rows[0].id;
    ok(`Created farmer Shivam (${farmerId})`);
  }

  // ── 3. Create farm ────────────────────────────────────────────────────────
  let farmId;
  const existingFarm = await query(
    'SELECT id FROM farms WHERE name = $1 AND farmer_id = $2',
    [FARM.name, farmerId]
  );

  if (existingFarm.rows.length) {
    farmId = existingFarm.rows[0].id;
    skip(`Farm "${FARM.name}" (${farmId})`);
  } else {
    const result = await query(
      `INSERT INTO farms (farmer_id, name, location, crop_types)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [farmerId, FARM.name, FARM.location, FARM.crop_types]
    );
    farmId = result.rows[0].id;
    ok(`Created farm "${FARM.name}" (${farmId})`);
  }

  // ── 4. Inject visits + transcripts ───────────────────────────────────────
  for (const v of VISITS) {
    const existingVisit = await query(
      'SELECT id FROM visits WHERE farm_id = $1 AND visit_date = $2',
      [farmId, v.date]
    );

    if (existingVisit.rows.length) {
      skip(`Visit ${v.date}`);
      continue;
    }

    const visitRes = await query(
      `INSERT INTO visits (farm_id, staff_id, visit_date, category, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [farmId, staffId, v.date, v.category, v.notes]
    );
    const visitId = visitRes.rows[0].id;

    await query(
      `INSERT INTO transcripts (visit_id, audio_filename, full_text, detected_language, topic_category)
       VALUES ($1, $2, $3, $4, $5)`,
      [visitId, 'demo-recording.wav', v.transcript, 'en-IN', v.category]
    );

    ok(`Visit ${v.date} [${v.category}] + transcript (${visitId})`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────');
  console.log('  Demo scenario ready!\n');
  console.log(`  Farmer login : ${FARMER.email}`);
  console.log(`  Password     : ${FARMER.password}`);
  console.log(`  Farmer ID    : ${farmerId}`);
  console.log(`  Farm ID      : ${farmId}`);
  console.log('─────────────────────────────────────────────\n');

  await pool.end();
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  pool.end();
  process.exit(1);
});
