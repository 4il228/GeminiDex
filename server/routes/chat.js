const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const TIER_CONFIG = {
  free:  { model: 'gemini-2.5-flash', maxTokens: 4000,  contextLimit: '4k' },
  pro:   { model: 'gemini-1.5-pro',   maxTokens: 32000, contextLimit: '32k' },
  ultra: { model: 'gemini-1.5-pro',   maxTokens: 100000, contextLimit: '100k+' }
};

router.post('/chat', authMiddleware, async (req, res) => {
  const { message, context } = req.body;
  const tier = req.user.tier;
  const config = TIER_CONFIG[tier] || TIER_CONFIG.free;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let prompt = message;
  if (context) {
    prompt = `Контекст страницы:\n${context}\n\nВопрос пользователя: ${message}`;
  }

  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const response = await genai.models.generateContentStream({
      model: config.model,
      contents: prompt,
      config: {
        maxOutputTokens: config.maxTokens
      }
    });

    for await (const chunk of response) {
      const text = chunk.text || '';
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
