import express from 'express';
import { GoogleGenAI } from '@google/genai';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

const TIER_MODELS = {
  free:  { models: ['gemini-3.5-flash'], maxTokens: 65000, contextLimit: '1M' },
  pro:   { models: ['gemini-3.5-flash', 'gemini-2.5-pro'], maxTokens: 65000, contextLimit: '1M' },
  ultra: { models: ['gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'], maxTokens: 100000, contextLimit: '1M+' }
};

router.post('/chat', authMiddleware, async (req, res) => {
  const { message, context, model } = req.body;
  const tier = req.user.tier;
  const tierConfig = TIER_MODELS[tier] || TIER_MODELS.free;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const selectedModel = (model && tierConfig.models.includes(model))
    ? model
    : tierConfig.models[0];

  let prompt = message;
  if (context) {
    prompt = `Контекст страницы:\n${context}\n\nВопрос пользователя: ${message}`;
    console.log(`[chat] context: ${context.length} chars, model: ${selectedModel}, tier: ${tier}`);
  } else {
    console.log(`[chat] no context, model: ${selectedModel}, tier: ${tier}`);
  }

  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const response = await genai.models.generateContentStream({
      model: selectedModel,
      contents: prompt,
      config: {
        maxOutputTokens: tierConfig.maxTokens
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

export default router;
