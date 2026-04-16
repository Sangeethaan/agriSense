const axios = require('axios');

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const API_KEY         = process.env.SARVAM_API_KEY;

/**
 * transcribe
 * Sends base64-encoded audio to Sarvam STT and returns the transcript.
 *
 * @param {string} audioBase64  - Base64-encoded audio data
 * @param {string} language     - BCP-47 language code, e.g. 'hi-IN', 'ta-IN'
 * @returns {Promise<string>}   - Plain-text transcript
 */
async function transcribe(audioBase64, language = 'hi-IN') {
  // TODO: Replace stub with real Sarvam STT API call once endpoint is confirmed
  /*
  const response = await axios.post(
    `${SARVAM_BASE_URL}/speech-to-text`,
    { audio: audioBase64, language_code: language },
    { headers: { 'API-Subscription-Key': API_KEY, 'Content-Type': 'application/json' } }
  );
  return response.data.transcript;
  */

  console.log('[sarvamSTT] transcribe called – stub returning placeholder');
  return 'Transcript placeholder – integrate Sarvam STT API here';
}

module.exports = { transcribe };
