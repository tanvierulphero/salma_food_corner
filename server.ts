import express from 'express';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import {
  buildBazarPaySignaturePayload,
  createBazarPayPaymentSession,
  DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
  markBazarPaySessionPaid,
  storeIncomingBazarPayTx,
  verifyAndClaimBazarPayTx,
  type BazarPayPaymentSession,
  type BazarPayTransaction,
} from './src/utils/bazarpayPool.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BAZARPAY_SECRET = process.env.BAZARPAY_SECRET || 'bp_test_94f8a2c1e7b04d39';
const BAZARPAY_RECEIVER_NUMBERS = {
  BKASH: process.env.BAZARPAY_BKASH_NUMBER || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BKASH,
  NAGAD: process.env.BAZARPAY_NAGAD_NUMBER || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.NAGAD,
  ROCKET: process.env.BAZARPAY_ROCKET_NUMBER || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.ROCKET,
  BANGLA_QR: process.env.BAZARPAY_BANGLA_QR_NUMBER || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BANGLA_QR,
};

const app = express();

// 1) BazarPay live payment webhook (MUST run before express.json() so raw body HMAC matches exactly)
app.post('/api/bazarpay/webhook', express.text({ type: '*/*', limit: '2mb' }), (req, res) => {
  const ts = req.header('X-BazarPay-Timestamp') || '';
  const sig = req.header('X-BazarPay-Signature') || '';
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');
  const expected = crypto
    .createHmac('sha256', BAZARPAY_SECRET)
    .update(buildBazarPaySignaturePayload(ts, rawBody))
    .digest('hex');

  const sigBuf = Buffer.from(sig.toLowerCase(), 'utf8');
  const expBuf = Buffer.from(expected.toLowerCase(), 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ ok: false, error: 'Invalid HMAC signature' });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  serverDbStore = loadServerDbFromDisk();
  if (!serverDbStore._bazarpay_pool || typeof serverDbStore._bazarpay_pool !== 'object') {
    serverDbStore._bazarpay_pool = {};
  }
  const pool = serverDbStore._bazarpay_pool as Record<string, BazarPayTransaction>;
  const stored = storeIncomingBazarPayTx(pool, data);
  if (!stored.ok) {
    return res.status(400).json({ ok: false, error: stored.error });
  }
  saveServerDbToDisk(serverDbStore);
  return res.json({ ok: true, stored: stored.trxId });
});

app.use(express.json({ limit: '15mb' }));

// 2) Create Self-Hosted BazarPay Payment Session & Checkout URL
app.post('/api/bazarpay/create-payment', (req, res) => {
  serverDbStore = loadServerDbFromDisk();
  if (!serverDbStore._bazarpay_sessions || typeof serverDbStore._bazarpay_sessions !== 'object') {
    serverDbStore._bazarpay_sessions = {};
  }
  const sessions = serverDbStore._bazarpay_sessions as Record<string, BazarPayPaymentSession>;
  const created = createBazarPayPaymentSession(sessions, req.body || {}, BAZARPAY_RECEIVER_NUMBERS);
  saveServerDbToDisk(serverDbStore);
  return res.json({
    ok: true,
    paymentId: created.paymentId,
    checkoutUrl: created.checkoutUrl,
    receiverNumbers: created.receiverNumbers,
    banglaQrPayload: created.banglaQrPayload,
    session: created.session,
  });
});

app.get('/api/bazarpay/payment/:paymentId', (req, res) => {
  serverDbStore = loadServerDbFromDisk();
  const sessions = (serverDbStore._bazarpay_sessions || {}) as Record<string, BazarPayPaymentSession>;
  const session = sessions[req.params.paymentId];
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
  return res.json({ ok: true, session });
});

// 3) Website Checkout calls this to verify Customer TrxID & confirm Order!
app.post('/api/bazarpay/verify-order', (req, res) => {
  serverDbStore = loadServerDbFromDisk();
  if (!serverDbStore._bazarpay_pool || typeof serverDbStore._bazarpay_pool !== 'object') {
    serverDbStore._bazarpay_pool = {};
  }
  if (!serverDbStore._bazarpay_sessions || typeof serverDbStore._bazarpay_sessions !== 'object') {
    serverDbStore._bazarpay_sessions = {};
  }
  const pool = serverDbStore._bazarpay_pool as Record<string, BazarPayTransaction>;
  const sessions = serverDbStore._bazarpay_sessions as Record<string, BazarPayPaymentSession>;
  const result = verifyAndClaimBazarPayTx(pool, req.body || {});
  if (result.status === 200) {
    markBazarPaySessionPaid(sessions, {
      paymentId: req.body?.paymentId,
      orderId: result.body.orderId,
      trxId: result.body.trxId,
      gateway: result.body.gateway,
    });
    saveServerDbToDisk(serverDbStore);
  }
  return res.status(result.status).json(result.body);
});

const appRoot = fs.existsSync(path.resolve(__dirname, 'package.json'))
  ? __dirname
  : path.resolve(__dirname, '..');

const uploadsPath = path.resolve(appRoot, 'public', 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

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

    const systemInstruction = `You are "সালমা ফুড অ্যাসিস্ট্যান্ট" (Salma Food Assistant), the friendly and helpful AI customer support chatbot for "সালমা ফুড কর্ণার, গাজীপুর" (Salma Food Corner Gazipur), a premier traditional and fast food restaurant located at Chandana Chowrasta (Joydebpur Road), Gazipur-1700, Bangladesh.
    You help customers in Gazipur (Chandana Chowrasta, Joydebpur, Shibbari, Vogra Bypass, DUET, Board Bazar, Tongi, Konabari) with:
    - Menu recommendations (Kacchi Biryani, Tehari, Chicken Fry, Beef Kala Bhuna, Combo Bundles, Shahi Falooda, Borhani, etc.)
    - Delivery time and tracking in Gazipur (1 KM free delivery around the shop, average delivery time 25-40 mins)
    - Loyalty points system (earn 10 points per 100 ৳ spent, 100 points = 50 ৳ discount)
    - Payment methods (50% minimum advance via bKash, Nagad, or Card; remaining due via Cash on Delivery)
    - Special offers and discounts in Gazipur
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

// Server-side persistent database store (kept outside public/ so builds never ship preview test data)
const serverDbFilePath = path.resolve(appRoot, '.salma_preview_db.json');

function loadServerDbFromDisk(): Record<string, any> {
  try {
    if (fs.existsSync(serverDbFilePath)) {
      const raw = fs.readFileSync(serverDbFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read .salma_preview_db.json:', err);
  }
  return {};
}

function saveServerDbToDisk(data: Record<string, any>): void {
  try {
    fs.writeFileSync(serverDbFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write .salma_preview_db.json:', err);
  }
}

let serverDbStore: Record<string, any> = loadServerDbFromDisk();

app.get('/api.php', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  serverDbStore = loadServerDbFromDisk();
  if (req.query.action === 'bazarpay_payment') {
    const paymentId = String(req.query.paymentId || '').trim();
    const sessions = (serverDbStore._bazarpay_sessions || {}) as Record<string, BazarPayPaymentSession>;
    const session = sessions[paymentId];
    if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });
    return res.json({ ok: true, session });
  }
  const { _salma_meta, _bazarpay_pool: _ignoredPool, _bazarpay_sessions: _ignoredSessions, ...publicData } = serverDbStore;
  res.json({
    status: 'ok',
    connected: true,
    mysqlConnected: false,
    meta: _salma_meta && typeof _salma_meta === 'object' ? _salma_meta : {},
    data: publicData
  });
});

app.post('/api.php', (req, res) => {
  serverDbStore = loadServerDbFromDisk();
  const action = req.query.action || req.body?.action;
  if (action === 'bazarpay_create') {
    if (!serverDbStore._bazarpay_sessions || typeof serverDbStore._bazarpay_sessions !== 'object') {
      serverDbStore._bazarpay_sessions = {};
    }
    const sessions = serverDbStore._bazarpay_sessions as Record<string, BazarPayPaymentSession>;
    const created = createBazarPayPaymentSession(sessions, req.body || {}, BAZARPAY_RECEIVER_NUMBERS);
    saveServerDbToDisk(serverDbStore);
    return res.json({
      ok: true,
      paymentId: created.paymentId,
      checkoutUrl: created.checkoutUrl,
      receiverNumbers: created.receiverNumbers,
      session: created.session,
    });
  }
  if (action === 'bazarpay_verify') {
    if (!serverDbStore._bazarpay_pool || typeof serverDbStore._bazarpay_pool !== 'object') {
      serverDbStore._bazarpay_pool = {};
    }
    if (!serverDbStore._bazarpay_sessions || typeof serverDbStore._bazarpay_sessions !== 'object') {
      serverDbStore._bazarpay_sessions = {};
    }
    const pool = serverDbStore._bazarpay_pool as Record<string, BazarPayTransaction>;
    const sessions = serverDbStore._bazarpay_sessions as Record<string, BazarPayPaymentSession>;
    const result = verifyAndClaimBazarPayTx(pool, req.body || {});
    if (result.status === 200) {
      markBazarPaySessionPaid(sessions, {
        paymentId: req.body?.paymentId,
        orderId: result.body.orderId,
        trxId: result.body.trxId,
        gateway: result.body.gateway,
      });
      saveServerDbToDisk(serverDbStore);
    }
    return res.status(result.status).json(result.body);
  }
  if (action === 'upload_image') {
    const { imageBase64 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ status: 'error', message: 'ছবির ডাটা পাওয়া যায়নি।' });
    }
    const match = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    const ext = match ? (match[1] === 'jpeg' ? 'jpg' : match[1]) : 'jpg';
    const base64Data = match ? match[2] : imageBase64;
    const fileName = `food_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}.${ext}`;
    const filePath = path.join(uploadsPath, fileName);
    try {
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      return res.json({
        status: 'ok',
        savedOnDisk: true,
        imageUrl: `uploads/${fileName}`,
        message: 'ছবিটি সফলভাবে cPanel সার্ভারের uploads/ ফোল্ডারে সেভ হয়েছে!'
      });
    } catch {
      return res.json({
        status: 'ok',
        savedOnDisk: false,
        imageUrl: imageBase64,
        message: 'ছবিটি সফলভাবে ডাটাবেসে সংরক্ষিত হয়েছে!'
      });
    }
  }
  if (action === 'setup_db') {
    if (req.body?.currentData && typeof req.body.currentData === 'object') {
      if (!serverDbStore._salma_meta || typeof serverDbStore._salma_meta !== 'object') {
        serverDbStore._salma_meta = {};
      }
      const now = Date.now();
      for (const [k, v] of Object.entries(req.body.currentData)) {
        serverDbStore[k] = v;
        serverDbStore._salma_meta[k] = now;
      }
      saveServerDbToDisk(serverDbStore);
    }
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
  if (!serverDbStore._salma_meta || typeof serverDbStore._salma_meta !== 'object') {
    serverDbStore._salma_meta = {};
  }
  const updatedAt = Date.now();
  serverDbStore._salma_meta[key] = updatedAt;
  saveServerDbToDisk(serverDbStore);
  res.json({ status: 'ok', connected: true, key, updatedAt });
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
    const distPath = path.resolve(appRoot, 'dist');
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
