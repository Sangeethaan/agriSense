const axios = require('axios');

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const API_KEY         = process.env.SARVAM_API_KEY;

/**
 * query
 * Sends a prompt to the Sarvam LLM and returns the generated response.
 *
 * @param {string} prompt   - The user's question or instruction
 * @param {string} context  - Optional context (e.g. farm data, crop info)
 * @returns {Promise<string>} - Generated text answer
 */
async function query(prompt, context = '') {
  // TODO: Replace stub with real Sarvam LLM API call once endpoint is confirmed
  /*
  const response = await axios.post(
    `${SARVAM_BASE_URL}/chat/completions`,
    {
      model: 'sarvam-2b',
      messages: [
        { role: 'system', content: `You are an expert agricultural advisor. Context: ${context}` },
        { role: 'user',   content: prompt },
      ],
    },
    { headers: { 'API-Subscription-Key': API_KEY, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content;
  */

  console.log('[sarvamLLM] query called – stub returning placeholder');
  return 'LLM answer placeholder – integrate Sarvam LLM API here';
}

module.exports = { query };
