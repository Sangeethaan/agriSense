/**
 * sarvamSTT.js  —  Sarvam AI Speech-to-Text + Translation service wrapper
 *
 * API docs: https://docs.sarvam.ai/api-reference-docs/endpoints/speech-to-text-translate
 * Model:    saaras:v3 (translate endpoint)
 *
 * Sarvam's synchronous endpoint accepts audio up to 30 seconds.
 * For longer recordings (up to 5 minutes), this module automatically
 * chunks the audio into 25-second segments using ffmpeg, transcribes
 * each chunk, and joins the results.
 */

const axios    = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execFile } = require('child_process');
const ffmpegPath   = require('ffmpeg-static');

// Translate endpoint: accepts any Indian language, returns English output
const STT_URL        = 'https://api.sarvam.ai/speech-to-text-translate';
const CHUNK_SECS     = 25;   // Safe margin under Sarvam's 30 s limit
const MAX_AUDIO_SECS = 300;  // 5 minutes absolute cap

/**
 * Normalise whatever comes in (Buffer, ReadStream, base64 string, raw string)
 * into a Buffer so that form-data always sends a proper binary payload.
 */
function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Readable) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      input.on('data', chunk => chunks.push(chunk));
      input.on('end',  ()    => resolve(Buffer.concat(chunks)));
      input.on('error', reject);
    });
  }
  if (typeof input === 'string') {
    return Buffer.from(input, 'base64');
  }
  throw new TypeError(
    `Unsupported audio input type: ${typeof input}. Expected Buffer, ReadStream, or base64 string.`
  );
}

/** Infer Content-Type from filename extension */
function mimeFromFilename(name = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  const MAP = {
    wav:  'audio/wav',
    mp3:  'audio/mpeg',
    mp4:  'audio/mp4',
    m4a:  'audio/mp4',
    ogg:  'audio/ogg',
    webm: 'audio/webm',
    flac: 'audio/flac',
    aac:  'audio/aac',
    opus: 'audio/opus',
    '3gp': 'audio/3gpp',
    amr:  'audio/amr',
  };
  return MAP[ext] || 'audio/wav';
}

/** Extract a human-readable string from an Axios error */
function extractSarvamError(err) {
  const data = err.response?.data;
  if (!data) return err.message;
  if (typeof data === 'string') return data;
  // Sarvam error shape: { error: { message, code } }
  if (data?.error?.message) return data.error.message;
  if (data?.message)        return data.message;
  if (data?.detail)         return data.detail;
  return JSON.stringify(data);
}

/**
 * Run ffmpeg as a child process.
 * Returns a Promise that resolves on exit code 0.
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get the duration of an audio file in seconds using ffmpeg.
 */
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-i', filePath, '-f', 'null', '-'],
      (error, stdout, stderr) => {
        // ffmpeg writes duration info to stderr even on "error" exit
        const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (match) {
          const [, h, m, s] = match;
          resolve(
            parseInt(h, 10) * 3600 +
            parseInt(m, 10) * 60  +
            parseFloat(s)
          );
        } else {
          reject(new Error('Could not read audio duration'));
        }
      }
    );
  });
}

/**
 * Send one Buffer chunk to Sarvam STT and return the transcript string.
 */
async function sendChunkToSarvam(buffer, filename, languageCode, apiKey) {
  const form = new FormData();
  form.append('file', buffer, {
    filename,
    contentType: mimeFromFilename(filename),
  });
  form.append('model',                'saaras:v3');
  form.append('target_language_code', 'en-IN');
  form.append('source_language_code', languageCode);
  form.append('with_disfluencies',    'false');

  let response;
  try {
    response = await axios.post(STT_URL, form, {
      headers: {
        ...form.getHeaders(),
        'api-subscription-key': apiKey,
      },
      maxBodyLength:   Infinity,
      maxContentLength: Infinity,
      timeout: 120_000,  // 2 min per chunk
    });
  } catch (err) {
    console.error('Sarvam API Error:', err.response?.data || err.message);
    const msg = extractSarvamError(err);
    throw new Error(msg);
  }

  return {
    text: response.data?.translated_text ?? response.data?.transcript ?? response.data?.text ?? '',
    languageCode: response.data?.language_code ?? 'unknown'
  };
}

/**
 * transcribeBuffer
 *
 * Accepts a raw audio Buffer (up to 5 minutes).
 * Short clips (≤ 25 s) are sent directly to Sarvam.
 * Longer recordings are split into 25-second chunks via ffmpeg,
 * each chunk is transcribed, and the results are concatenated.
 *
 * @param {Buffer|import('stream').Readable|string} audioInput
 * @param {string} originalFilename
 * @param {string} sourceLanguageCode  BCP-47, e.g. 'kn-IN'
 * @returns {Promise<{text: string, languageCode: string}>}  English transcript and detected language code
 */
async function transcribeBuffer(audioInput, originalFilename = 'audio.mp3', sourceLanguageCode = 'unknown') {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY is not set in environment');

  const audioData = await Promise.resolve(toBuffer(audioInput));
  const ext       = (originalFilename.split('.').pop() || 'mp3').toLowerCase();
  const tmpDir    = os.tmpdir();

  // Write buffer to a temp file so ffmpeg can read it
  const inputPath  = path.join(tmpDir, `agrisense-in-${Date.now()}.${ext}`);
  fs.writeFileSync(inputPath, audioData);

  let duration;
  try {
    duration = await getAudioDuration(inputPath);
  } catch {
    // If we can't read duration, try sending as-is (≤ 25 s assumed)
    duration = 0;
  }

  // Enforce 5-minute cap
  if (duration > MAX_AUDIO_SECS) {
    fs.unlinkSync(inputPath);
    throw new Error(
      `Audio is ${Math.round(duration)}s long — maximum allowed is ${MAX_AUDIO_SECS / 60} minutes (${MAX_AUDIO_SECS}s).`
    );
  }

  let transcript = '';
  let finalLanguageCode = 'unknown';

  if (duration > 0 && duration > CHUNK_SECS) {
    // ── Long audio: split into chunks ──────────────────────────────
    console.log(`[sarvamSTT] Audio is ${Math.round(duration)}s — splitting into ${CHUNK_SECS}s chunks`);
    const numChunks = Math.ceil(duration / CHUNK_SECS);
    const transcripts = [];

    for (let i = 0; i < numChunks; i++) {
      const startSec  = i * CHUNK_SECS;
      const chunkPath = path.join(tmpDir, `agrisense-chunk-${Date.now()}-${i}.wav`);

      // Export this segment as WAV (Sarvam handles WAV reliably)
      await runFfmpeg([
        '-ss',  String(startSec),
        '-t',   String(CHUNK_SECS),
        '-i',   inputPath,
        '-ac',  '1',          // mono
        '-ar',  '16000',      // 16 kHz — Sarvam's preferred sample rate
        '-f',   'wav',
        '-y',
        chunkPath,
      ]);

      const chunkBuffer = fs.readFileSync(chunkPath);
      fs.unlinkSync(chunkPath);

      console.log(`[sarvamSTT] Sending chunk ${i + 1}/${numChunks} (start=${startSec}s)`);
      const chunkResult = await sendChunkToSarvam(
        chunkBuffer, `chunk-${i}.wav`, sourceLanguageCode, apiKey
      );
      if (chunkResult.text.trim()) transcripts.push(chunkResult.text.trim());
      if (i === 0 && chunkResult.languageCode && chunkResult.languageCode !== 'unknown') {
        finalLanguageCode = chunkResult.languageCode;
      }
    }

    transcript = transcripts.join(' ');
  } else {
    // ── Short audio: send directly ─────────────────────────────────
    const result = await sendChunkToSarvam(audioData, originalFilename, sourceLanguageCode, apiKey);
    transcript = result.text;
    finalLanguageCode = result.languageCode;
  }

  // Clean up temp input file
  try { fs.unlinkSync(inputPath); } catch { /* already gone */ }

  return { 
    text: transcript, 
    languageCode: finalLanguageCode && finalLanguageCode !== 'unknown' ? finalLanguageCode : 'en-IN' 
  };
}

module.exports = { transcribeBuffer };
