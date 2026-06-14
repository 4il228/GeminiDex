import 'dotenv/config';
import { setupProxy } from './proxy.js';

await setupProxy();

import express from 'express';
import cors from 'cors';
import chatRoutes from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use('/api/v1', chatRoutes);

app.listen(PORT, () => {
  console.log(`Gemini Agent proxy running on http://localhost:${PORT}`);
});

export default app;
