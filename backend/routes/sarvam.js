const express   = require('express');
const router    = express.Router();
const { authenticate } = require('../middleware/auth');
const sarvamSTT = require('../services/sarvamSTT');
const sarvamLLM = require('../services/sarvamLLM');

/**
 * POST /api/sarvam/transcribe
 * Convert voice input to text using Sarvam STT
 */
router.post('/transcribe', authenticate, async (req, res, next) => {
  try {
    const { audioBase64, language } = req.body;
    const transcript = await sarvamSTT.transcribe(audioBase64, language);
    res.json({ transcript });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sarvam/query
 * Ask the Sarvam LLM a farm-related question
 */
router.post('/query', authenticate, async (req, res, next) => {
  try {
    const { prompt, context } = req.body;
    const answer = await sarvamLLM.query(prompt, context);
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
