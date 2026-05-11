/**
 * cleanMasterReport.js
 * One-shot script: finds Ravi Kumar's Marigold farm and deletes its
 * master_report so it can be regenerated cleanly via the UI.
 *
 * Run: node backend/scripts/cleanMasterReport.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { query } = require('../db');

async function main() {
  // Find matching farms (Ravi Kumar or Marigold)
  const farms = await query(`
    SELECT f.id, f.name AS farm_name, u.name AS farmer_name
    FROM   farms f
    JOIN   users u ON u.id = f.farmer_id
    WHERE  LOWER(u.name)  LIKE '%ravi%'
        OR LOWER(f.name)  LIKE '%marigold%'
  `);

  if (!farms.rows.length) {
    console.log('No matching farms found.');
    return;
  }

  console.log('Matching farms found:');
  farms.rows.forEach(r => console.log(`  • ${r.farmer_name} / ${r.farm_name} (${r.id})`));

  for (const farm of farms.rows) {
    const del = await query(
      'DELETE FROM master_reports WHERE farm_id = $1 RETURNING farm_id',
      [farm.id]
    );
    if (del.rows.length) {
      console.log(`✅  Deleted stale master_report for: ${farm.farmer_name} — ${farm.farm_name}`);
    } else {
      console.log(`ℹ️   No master_report existed for: ${farm.farmer_name} — ${farm.farm_name}`);
    }
  }

  console.log('\nDone. Click ✨ Regenerate in the UI to produce a clean report.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
