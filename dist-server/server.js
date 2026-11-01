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
        const formattedHistory = chatHistory.map((h) => ({
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
        const replyText = result.text || result.response?.text || '';
        res.json({ reply: replyText });
    }
    catch (error) {
        console.error('Gemini chat error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate response' });
    }
});
// Bulk SMS / SMS notification simulation endpoint
app.post('/api/send-sms', async (req, res) => {
    try {
        const { phoneNumbers, message } = req.body;
        console.log(`[SMS Simulation] Sending to ${phoneNumbers?.length || 1} numbers: "${message}"`);
        await new Promise(resolve => setTimeout(resolve, 800));
        res.json({ success: true, sentCount: phoneNumbers?.length || 1 });
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'SMS send failed' });
    }
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
    }
    else {
        const distPath = path.resolve(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }
    app.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`Salma Food Corner server running at http://localhost:${PORT}`);
    });
}
setupServer();
