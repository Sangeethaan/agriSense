const axios = require('axios');

/**
 * generateTTS
 * 
 * Uses Sarvam AI Text-to-Speech API to convert text to speech.
 * Returns the base64 encoded audio string.
 *
 * @param {string} text - The text to synthesize
 * @param {string} languageCode - Target language code (e.g. 'en-IN', 'hi-IN')
 * @returns {Promise<string>} Base64 audio string
 */
async function generateTTS(text, languageCode = 'en-IN') {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY is not set in environment');

  try {
    const response = await axios.post(
      'https://api.sarvam.ai/text-to-speech',
      {
        inputs: [text],
        target_language_code: languageCode,
        speaker: 'meera', // 'meera' is a common default voice, update if another is desired
        pitch: 0,
        pace: 1.0,
        loudness: 1.5,
        speech_sample_rate: 8000,
        enable_preprocessing: true,
        model: 'bulbul:v3'
      },
      {
        headers: {
          'api-subscription-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds
      }
    );

    // The API returns { audios: ["base64_string_here"] }
    if (response.data && response.data.audios && response.data.audios.length > 0) {
      return response.data.audios[0];
    } else {
      throw new Error('Unexpected response format from Sarvam TTS API');
    }
  } catch (err) {
    console.error('Sarvam TTS Error:', err.response?.data || err.message);
    throw new Error('Failed to generate TTS audio');
  }
}

module.exports = { generateTTS };
