const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { handleChatQuery } = require('../services/chatService');
const { transcribeBuffer } = require('../services/sarvamSTT');
const { generateTTS } = require('../services/sarvamTTS');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

router.post('/ask', authenticate, upload.single('audio'), async (req, res, next) => {
  try {
    let queryText = req.body.text;
    let languageCode = 'en-IN'; // Default language for text

    // If an audio file is uploaded, transcribe it first
    if (req.file) {
      try {
        const sttResult = await transcribeBuffer(req.file.buffer, req.file.originalname, 'unknown');
        queryText = sttResult.text;
        languageCode = sttResult.languageCode;
      } catch (err) {
        console.error('[chat/ask] STT error:', err.message);
        return res.status(422).json({ error: `Audio transcription failed: ${err.message}` });
      }
    }

    if (!queryText || !queryText.trim()) {
      return res.status(400).json({ error: 'Text query or audio file is required.' });
    }

    // Process query through Chat Service (RAG + Gemini)
    const { reply, source } = await handleChatQuery(req.user, queryText, languageCode);

    let audioBase64 = null;
    
    // Automatically generate TTS if the user is a farmer
    if (req.user.role === 'farmer') {
      try {
         audioBase64 = await generateTTS(reply, languageCode);
      } catch (ttsErr) {
         console.error('[chat/ask] TTS error:', ttsErr.message);
         // Don't fail the request if TTS fails, just return text
      }
    }

    return res.json({ reply, source, audioBase64 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
