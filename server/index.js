require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState } = require('@adiwajshing/baileys');
const path = require('path');
const fs = require('fs');
// Use SQLite init for fallback; operational data functions now come from data layer (Supabase-aware)
const { init } = require('./db');
const { saveMessage, getMessages, upsertContact, createInvoice, getInvoiceByInvoiceId, listInvoices, markInvoicePaid, createSubscription, getSubscriptionByWorkspace, createTemplate, listTemplates, getTemplateById, updateTemplate, deleteTemplate, createAutomation, listAutomations, getAutomationById, updateAutomation, deleteAutomation, getTotals, getCountsByDay, getTopContacts } = require('./data');
const { registerOrLogin, signToken, authMiddleware } = require('./auth');
const { Configuration, OpenAIApi } = require('openai');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3333;
const SESSIONS_DIR = path.join(__dirname, 'sessions');

init(); // init database

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let sockState = { connected: false, qr: null };

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_KEY
}));

async function startSocket() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
    const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      console.log('connection.update', update);
      if (update.qr) {
        sockState.qr = update.qr;
        sockState.connected = false;
      }
      if (update.connection === 'open') {
        sockState.connected = true;
        sockState.qr = null;
      }
      if (update.lastDisconnect) {
        console.log('lastDisconnect', update.lastDisconnect);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      try {
        const msgs = m.messages;
        for (const msg of msgs) {
          if (!msg.message) continue;
          const text = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || "";
          const from = msg.key.remoteJid;
          console.log('received', from, text);

          upsertContact(from);
          saveMessage({
            from_number: from,
            to_number: sock.user?.id || 'server',
            direction: 'in',
            text,
            meta: msg
          });

          const lower = (text || '').toLowerCase();
          let reply = null;
          if (lower.includes('order')) {
            reply = 'Thanks for your interest! Reply with the item name and your address to place an order.';
          } else if (lower.includes('hours') || lower.includes('open')) {
            reply = 'We are open Mon-Fri 9am-6pm. Weekend by appointment.';
          } else {
            if (process.env.OPENAI_KEY) {
              try {
                const prompt = `You are a helpful sales assistant for a Caribbean small business. A customer said: "${text}". Craft a short (max 40 words) friendly reply with a CTA to order.`;
                const resp = await openai.createChatCompletion({
                  model: 'gpt-4o-mini',
                  messages: [{role:'system', content: 'You are a helpful sales assistant.'},{role:'user', content: prompt}],
                  max_tokens: 80,
                });
                reply = resp.data.choices?.[0]?.message?.content?.trim() || 'Thanks, we will be with you shortly!';
              } catch (err) {
                console.error('OpenAI error', err.message);
                reply = 'Thanks, we will be with you shortly!';
              }
            } else {
              reply = 'Thanks for your message! How can we help?';
            }
          }

          if (reply && sock && sock.sendMessage) {
            try {
              await sock.sendMessage(from, { text: reply });
              saveMessage({ from_number: 'server', to_number: from, direction: 'out', text: reply });
            } catch (err) {
              console.error('sendMessage error', err);
            }
          }
        }
      } catch (e) {
        console.error('messages.upsert handler error', e);
      }
    });

    console.log('Baileys socket started. Scan QR from server terminal if needed.');
  } catch (err) {
    console.error('startSocket error', err);
  }
}

startSocket();

// Serve simple health endpoint
app.get('/health', (req, res) => res.json({ ok: true }));

// Auth: register or login (simple unified endpoint)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const { user, workspace } = await registerOrLogin(email, password);
    const token = signToken(user, workspace);
    res.json({ token, user: { id: user.id, email: user.email }, workspace });
  } catch (e) {
    res.status(401).json({ error: e.message || 'login failed' });
  }
});

// API: session
app.get('/api/session', (req, res) => {
  res.json({ connected: sockState.connected, qr: sockState.qr });
});

// API: messages (protected). Optional peer filter (?peer=jid)
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const peer = req.query.peer || null;
    const rows = await getMessages(200, peer);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'messages fetch failed' });
  }
});

// API: send (protected)
app.post('/api/send', authMiddleware, async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: 'to + text required' });
  if (!sock) return res.status(500).json({ error: 'WhatsApp socket not ready' });
  try {
    await sock.sendMessage(to, { text });
    await saveMessage({ from_number: 'server', to_number: to, direction: 'out', text });
    res.json({ success: true });
  } catch (err) {
    console.error('send error', err);
    res.status(500).json({ error: 'send failed' });
  }
});

// Billing endpoints (create invoice, list, webhook simulation, invoice status, subscription)
app.post('/api/billing/create-invoice', authMiddleware, async (req, res) => {
  try {
    const { plan='starter' } = req.body;
    const workspace = req.workspace?.slug || 'demo-workspace';
    const prices = { starter:29.99, premium:59.99, business:195.00 };
    const amount = prices[plan] || prices['starter'];
    const currency = 'USD';
    const invoice_id = 'inv_' + uuidv4().replace(/-/g,'').slice(0,16);
    await createInvoice({ invoice_id, workspace, plan, amount, currency });
    const payoneer_link = `https://payoneer.mock/pay?invoice=${invoice_id}&amount=${amount}&currency=${currency}`;
    res.json({ invoice_id, workspace, plan, amount, currency, payoneer_link, status:'pending' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'create invoice failed' });
  }
});

app.get('/api/billing/invoices', authMiddleware, async (req, res) => {
  try {
    const rows = await listInvoices(200);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'list invoices failed' });
  }
});

app.post('/api/billing/payoneer/webhook', async (req, res) => {
  const secret = process.env.PAYONEER_WEBHOOK_SECRET || '';
  const incoming = req.headers.get ? req.headers.get('x-payoneer-secret') : req.headers['x-payoneer-secret'] || '';
  if (secret && incoming !== secret) {
    return res.status(403).json({ error: 'invalid signature' });
  }
  try {
    const { invoice_id } = req.body;
    const inv = getInvoiceByInvoiceId(invoice_id);
    if (!inv) return res.status(404).json({ error: 'invoice not found' });
    markInvoicePaid(invoice_id);
    createSubscription({ workspace: inv.workspace, plan: inv.plan, months: 1 });
    return res.json({ success:true, invoice: getInvoiceByInvoiceId(invoice_id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'webhook error' });
  }
});

app.get('/api/billing/invoice-status/:invoice_id', authMiddleware, async (req, res) => {
  const id = req.params.invoice_id;
  const inv = await getInvoiceByInvoiceId(id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  res.json(inv);
});

app.get('/api/billing/subscription/:workspace', authMiddleware, async (req, res) => {
  const ws = req.params.workspace || req.workspace?.slug;
  const sub = await getSubscriptionByWorkspace(ws);
  res.json({ subscription: sub });
});

// Analytics
app.get('/api/analytics/overview', authMiddleware, async (req, res) => {
  try {
    const totals = await getTotals();
    const byDay = await getCountsByDay(14);
    const topContacts = await getTopContacts(5);
    res.json({ totals, byDay, topContacts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'analytics error' });
  }
});

// Templates CRUD
app.get('/api/templates', authMiddleware, async (req, res) => {
  try { res.json(await listTemplates(500)); } catch (e){ res.status(500).json({ error: 'list templates failed' }); }
});

app.post('/api/templates', authMiddleware, async (req, res) => {
  const { name, category, content } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });
  try {
    const t = await createTemplate({ name, category, content });
    res.json(t);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create template failed' });
  }
});

app.get('/api/templates/:id', authMiddleware, async (req, res) => {
  const t = await getTemplateById(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.put('/api/templates/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const t = await updateTemplate(id, req.body || {});
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.delete('/api/templates/:id', authMiddleware, async (req, res) => {
  await deleteTemplate(Number(req.params.id));
  res.json({ success: true });
});

// Automations CRUD
app.get('/api/automations', authMiddleware, async (req, res) => {
  try { res.json(await listAutomations(500)); } catch (e){ res.status(500).json({ error: 'list automations failed' }); }
});

app.post('/api/automations', authMiddleware, async (req, res) => {
  const { name, flow_json } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const a = await createAutomation({ name, flow_json });
    res.json(a);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create automation failed' });
  }
});

app.get('/api/automations/:id', authMiddleware, async (req, res) => {
  const a = await getAutomationById(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json(a);
});

app.put('/api/automations/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const a = await updateAutomation(id, req.body || {});
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json(a);
});

app.delete('/api/automations/:id', authMiddleware, async (req, res) => {
  await deleteAutomation(Number(req.params.id));
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  console.log(`Open http://localhost:${PORT}/api/session to see connection state`);
});
