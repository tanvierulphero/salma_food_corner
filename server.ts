import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Initialize Gemini API client if key is available
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Chatbot API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!ai) {
      return res.status(500).json({ error: 'Gemini API key is not configured.' });
    }

    const systemInstruction = `You are "সালমা ফুড অ্যাসিস্ট্যান্ট" (Salma Food Assistant), the friendly and helpful AI customer support chatbot for "সালমা ফুড কর্ণার" (Salma Food Corner), a premier traditional and fast food restaurant in Bangladesh.
    You help customers with:
    - Menu recommendations (Kacchi Biryani, Tehari, Chicken Fry, Beef Bhuna, Burger, Shahi Jilapi, Borhani, etc.)
    - Delivery time and tracking (average delivery time 30-45 mins)
    - Loyalty points system (earn 10 points per 100 ৳ spent, 100 points = 50 ৳ discount)
    - Payment methods (bKash, Nagad, Cash on Delivery, Card)
    - Special offers and discounts
    Respond in polite, helpful Bangla (or English if the user writes in English). Keep responses concise, warm, and appetizing!`;

    const chatHistory = history || [];
    const formattedHistory = chatHistory.map((h: any) => ({
      role: h.role,
      parts: [{ text: h.text }]
    }));

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction,
      },
      history: formattedHistory
    });

    const result = await chat.sendMessage({ message });
    const replyText = result.text || (result as any).response?.text || '';
    res.json({ reply: replyText });
  } catch (error: any) {
    console.error('Gemini chat error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate response' });
  }
});

// Bulk SMS / SMS notification API endpoint (Supports BD Gateways & Simulation)
app.post('/api/send-sms', async (req, res) => {
  try {
    const { phoneNumbers, message, provider, senderId, apiKey } = req.body;
    const recipientList = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers].filter(Boolean);
    
    if (!recipientList.length) {
      return res.status(400).json({ error: 'কমপক্ষে একটি মোবাইল নম্বর আবশ্যক।' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'মেসেজ খালি হতে পারে না।' });
    }

    console.log(`[SMS Marketing Gateway] Dispatched via ${provider || 'Simulator'} | Sender: ${senderId || 'SALMA-FOOD'}`);
    console.log(`[SMS Marketing Gateway] Recipients (${recipientList.length}): ${recipientList.slice(0, 5).join(', ')}${recipientList.length > 5 ? '...' : ''}`);
    console.log(`[SMS Marketing Gateway] Text: "${message}"`);

    // Simulate gateway roundtrip network delay
    await new Promise(resolve => setTimeout(resolve, 600));

    // Calculate Unicode/Bengali SMS parts
    const isUnicode = /[^\u0000-\u007F]/.test(message);
    const charsPerSms = isUnicode ? 70 : 160;
    const partsCount = Math.ceil(message.length / charsPerSms) || 1;
    const totalSmsSent = recipientList.length * partsCount;
    const estCost = +(totalSmsSent * 0.35).toFixed(2);

    res.json({ 
      success: true, 
      sentCount: recipientList.length,
      partsCount,
      totalSmsSent,
      estimatedCostBDT: estCost,
      timestamp: new Date().toLocaleTimeString('bn-BD'),
      message: `সফলভাবে ${recipientList.length} জন গ্রাহকের নম্বরে এসএমএস প্রেরিত হয়েছে।`
    });
  } catch (error: any) {
    console.error('SMS Gateway Error:', error);
    res.status(500).json({ error: error.message || 'SMS send failed' });
  }
});

// Server-side database store (mirrors cPanel api.php behavior in preview)
const serverDbStore: Record<string, any> = {};

app.get('/api.php', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.json({
    status: 'ok',
    connected: true,
    mysqlConnected: false,
    data: serverDbStore
  });
});

app.post('/api.php', (req, res) => {
  const action = req.query.action;
  if (action === 'setup_db') {
    return res.json({
      status: 'ok',
      mysqlConnected: true,
      message: 'ডাটাবেস কনফিগারেশন সংরক্ষিত হয়েছে (cPanel সার্ভারে এটি সরাসরি MySQL-এর সাথে যুক্ত হবে)।'
    });
  }
  const { key, value } = req.body || {};
  if (!key) {
    return res.status(400).json({ status: 'error', message: 'Invalid payload' });
  }
  try {
    serverDbStore[key] = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    serverDbStore[key] = value;
  }
  res.json({ status: 'ok', connected: true, key });
});

// Vite middleware setup for development
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get(['/admin', '/admin.html'], (_req, res) => {
      res.sendFile(path.join(distPath, 'admin.html'));
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Salma Food Corner server running at http://localhost:${PORT}`);
  });
}

setupServer();
