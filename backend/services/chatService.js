const { GoogleGenerativeAI } = require('@google/generative-ai');
const { query } = require('../db');

/**
 * handleChatQuery
 * 
 * Handles role-based context retrieval and Gemini prompting.
 * 
 * @param {object} user - The authenticated user object (must have id, role, name)
 * @param {string} queryText - The question asked by the user
 * @param {string} languageCode - BCP-47 language code for the user's query
 * @returns {Promise<{reply: string, source: string}>}
 */
async function handleChatQuery(user, queryText, languageCode = 'en-IN') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  let dbContext = `User Profile:\nName: ${user.name || 'Unknown'}\nRole: ${user.role}\n\n`;
  let source = 'No context available';

  try {
    if (user.role === 'farmer') {
      // 1. Get their first farm
      const farmRes = await query('SELECT id, name FROM farms WHERE farmer_id = $1 ORDER BY created_at ASC LIMIT 1', [user.id]);
      if (farmRes.rows.length === 0) {
        return { reply: "You don't have any farms registered yet.", source: "System" };
      }
      const farmId = farmRes.rows[0].id;
      const farmName = farmRes.rows[0].name;

      // 2. Get latest master report
      const mrRes = await query('SELECT content FROM master_reports WHERE farm_id = $1', [farmId]);
      const mrContent = mrRes.rows.length ? JSON.stringify(mrRes.rows[0].content) : "No master report generated yet.";

      // 3. Get last 3 transcripts
      const trRes = await query(`
        SELECT t.full_text, v.visit_date
        FROM transcripts t
        JOIN visits v ON t.visit_id = v.id
        WHERE v.farm_id = $1
        ORDER BY v.created_at DESC
        LIMIT 3
      `, [farmId]);
      
      const transcripts = trRes.rows.map((t, i) => {
        const dateStr = t.visit_date ? new Date(t.visit_date).toLocaleDateString() : 'Unknown Date';
        return `Transcript ${i+1} (${dateStr}): ${t.full_text}`;
      }).join('\n');

      dbContext += `Farm: ${farmName}\nMaster Report: ${mrContent}\nRecent Transcripts:\n${transcripts}`;
      source = `Farm: ${farmName}`;

    } else if (user.role === 'supervisor') {
      // Get overview stats to match the UI dashboard
      const [farmsResult, visitsResult, recentVisitsResult] = await Promise.all([
        query(`SELECT COUNT(f.id) AS count FROM farms f JOIN users u ON u.id = f.farmer_id WHERE u.supervisor_id = $1`, [user.id]),
        query(`SELECT COUNT(v.id) AS count FROM visits v JOIN farms f ON f.id = v.farm_id JOIN users u ON u.id = f.farmer_id WHERE u.supervisor_id = $1 AND v.visit_date >= date_trunc('week', CURRENT_DATE)`, [user.id]),
        query(`SELECT COUNT(v.id) AS count FROM visits v JOIN farms f ON f.id = v.farm_id JOIN users u ON u.id = f.farmer_id WHERE u.supervisor_id = $1 AND v.visit_date >= CURRENT_DATE - INTERVAL '30 days'`, [user.id])
      ]);

      const overviewStats = `Total Farms: ${farmsResult.rows[0].count}\nVisits This Week: ${visitsResult.rows[0].count}\nVisits This Month (Last 30 Days): ${recentVisitsResult.rows[0].count}\n`;

      // Get the farmers registered under this supervisor
      const farmersRes = await query(`
        SELECT name, phone, village
        FROM users
        WHERE supervisor_id = $1 AND role = 'farmer'
      `, [user.id]);
      
      const farmersCount = farmersRes.rows.length;
      const farmersList = farmersRes.rows.map(f => `${f.name} (Village: ${f.village || 'N/A'}, Phone: ${f.phone || 'N/A'})`).join(', ');

      // Get visit counts per farm
      const visitStatsRes = await query(`
        SELECT f.name as farm_name, f.location as farm_location, u.name as farmer_name, COUNT(v.id) as visit_count
        FROM visits v
        JOIN farms f ON v.farm_id = f.id
        JOIN users u ON f.farmer_id = u.id
        WHERE v.staff_id = $1
        GROUP BY f.name, f.location, u.name
        ORDER BY visit_count DESC
      `, [user.id]);
      
      const visitStats = visitStatsRes.rows.length 
        ? visitStatsRes.rows.map(row => `${row.farm_name} (Location: ${row.farm_location || 'N/A'}, Owned by: ${row.farmer_name}): ${row.visit_count} visits`).join('\n')
        : "No visits recorded yet.";

      // Get recent visits timeline
      const recentVisitsRes = await query(`
        SELECT v.visit_date, f.name as farm_name, f.location as farm_location, u.name as farmer_name, v.category
        FROM visits v
        JOIN farms f ON v.farm_id = f.id
        JOIN users u ON f.farmer_id = u.id
        WHERE v.staff_id = $1
        ORDER BY v.visit_date DESC, v.created_at DESC
        LIMIT 10
      `, [user.id]);

      const recentVisits = recentVisitsRes.rows.length
        ? recentVisitsRes.rows.map(row => `Date: ${row.visit_date ? new Date(row.visit_date).toLocaleDateString() : 'Unknown'}, Farm: ${row.farm_name}, Location: ${row.farm_location || 'N/A'}, Farmer: ${row.farmer_name}, Category: ${row.category}`).join('\n')
        : "No recent visits.";

      // Summarize health statuses and next steps for all farms visited by this supervisor
      const mrRes = await query(`
        SELECT f.name, mr.content
        FROM master_reports mr
        JOIN farms f ON mr.farm_id = f.id
        WHERE EXISTS (
          SELECT 1 FROM visits v WHERE v.farm_id = f.id AND v.staff_id = $1
        )
      `, [user.id]);
      
      const reportContext = mrRes.rows.length 
        ? mrRes.rows.map(row => `Farm: ${row.name}, Report: ${JSON.stringify(row.content)}`).join('\n\n')
        : "No farm reports generated yet.";

      dbContext += `Supervisor Dashboard Overview:\n${overviewStats}\nSupervisor Registered Farmers Count: ${farmersCount}\nFarmers List: ${farmersList}\n\nVisit Statistics:\n${visitStats}\n\nRecent Visits Timeline:\n${recentVisits}\n\nFarm Reports:\n${reportContext}`;
      source = `Data from ${mrRes.rows.length} farms visited and ${farmersCount} registered farmers`;

    } else if (user.role === 'manager') {
      // High-level summary of all regional risks across the entire database
      const mrRes = await query(`
        SELECT f.name, mr.content
        FROM master_reports mr
        JOIN farms f ON mr.farm_id = f.id
      `);

      if (mrRes.rows.length === 0) {
         return { reply: "No reports generated yet.", source: "System" };
      }

      dbContext += mrRes.rows.map(row => `Farm: ${row.name}, Report: ${JSON.stringify(row.content)}`).join('\n\n');
      source = `Aggregated Regional Data (${mrRes.rows.length} farms)`;
    }

    const languageNames = {
      'hi-IN': 'Hindi',
      'bn-IN': 'Bengali',
      'kn-IN': 'Kannada',
      'ml-IN': 'Malayalam',
      'mr-IN': 'Marathi',
      'od-IN': 'Odia',
      'pa-IN': 'Punjabi',
      'ta-IN': 'Tamil',
      'te-IN': 'Telugu',
      'gu-IN': 'Gujarati',
      'en-IN': 'English'
    };
    const languageName = languageNames[languageCode] || languageCode;

    let systemPrompt = "You are the AgriSense Assistant. Use ONLY the provided database context. If the user asks for specific facts, instructions, or details that are NOT present in the provided context, politely and directly inform them that there is no record of that specific detail (e.g., 'There is no record of suggesting a specific amount of water,' or 'That detail is not present in the current reports'), instead of giving a generic 'I don't have access' response. Do not provide generic agricultural advice. When identifying a farm, always provide the farmer's name, the farm/plot name, and its location if available.";

    if (languageCode !== 'en-IN' && languageCode !== 'unknown') {
      systemPrompt += `\n\nIMPORTANT: The user query was originally asked in ${languageName}. You MUST translate your entire final response into ${languageName} using its native script.`;
    }

    const prompt = `${systemPrompt}\n\nDatabase Context:\n${dbContext}\n\nUser Query: ${queryText}`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    return { reply, source };

  } catch (error) {
    console.error('ChatService Error:', error);
    throw new Error('Failed to process chat query.');
  }
}

module.exports = { handleChatQuery };
