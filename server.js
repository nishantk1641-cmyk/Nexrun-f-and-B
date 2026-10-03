import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import OpenAI from 'openai';
import Razorpay from 'razorpay';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const PRO_PLAN_AMOUNT_INR = Number(process.env.PRO_PLAN_AMOUNT_INR || 499);

const db = new Database(path.join(__dirname, 'data', 'nexrun.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_id TEXT UNIQUE,
  payment_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}
function setAuthCookie(res, token) {
  res.cookie('nexrun_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
function auth(req, res, next) {
  const token = req.cookies.nexrun_token;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}
function getUser(id) {
  return db.prepare('SELECT id, name, email, plan, created_at FROM users WHERE id = ?').get(id);
}
function cleanEmail(email) { return String(email || '').trim().toLowerCase(); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function verifyRazorpaySignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
}

// Razorpay webhook needs the raw request body for HMAC verification.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).send('Webhook secret not configured');
  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest('hex');
  if (!signature || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return res.status(400).send('Invalid signature');
  }
  try {
    const event = JSON.parse(req.body.toString('utf8'));
    const paymentEntity = event?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;
    const paymentId = paymentEntity?.id;
    if (orderId) {
      const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
      if (payment) {
        const status = event.event === 'payment.captured' ? 'paid' : event.event === 'payment.failed' ? 'failed' : payment.status;
        db.prepare('UPDATE payments SET payment_id = COALESCE(?, payment_id), status = ? WHERE order_id = ?')
          .run(paymentId || null, status, orderId);
        if (status === 'paid') db.prepare("UPDATE users SET plan='pro' WHERE id=?").run(payment.user_id);
      }
    }
    return res.json({ ok: true });
  } catch {
    return res.status(400).send('Invalid webhook');
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'nexrun-api' }));

app.post('/api/auth/signup', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)').run(name, email, hash);
    const user = getUser(result.lastInsertRowid);
    setAuthCookie(res, signToken(user));
    return res.status(201).json({ user });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'An account with that email already exists.' });
    console.error(error);
    return res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  const user = getUser(row.id);
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('nexrun_token');
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: getUser(req.user.sub) }));

app.get('/api/chats', auth, (req, res) => {
  const chats = db.prepare('SELECT id,title,created_at,updated_at FROM chats WHERE user_id=? ORDER BY updated_at DESC LIMIT 50').all(req.user.sub);
  res.json({ chats });
});

app.get('/api/chats/:id', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id=? AND user_id=?').get(req.params.id, req.user.sub);
  if (!chat) return res.status(404).json({ error: 'Chat not found.' });
  res.json({ ...chat, messages: JSON.parse(chat.messages_json) });
});

app.post('/api/chats', auth, (req, res) => {
  const title = String(req.body?.title || 'New chat').slice(0, 120);
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [];
  const result = db.prepare('INSERT INTO chats (user_id,title,messages_json) VALUES (?,?,?)').run(req.user.sub, title, JSON.stringify(messages));
  res.status(201).json({ id: result.lastInsertRowid });
});

app.put('/api/chats/:id', auth, (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [];
  const title = String(req.body?.title || 'New chat').slice(0, 120);
  const result = db.prepare("UPDATE chats SET title=?, messages_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?")
    .run(title, JSON.stringify(messages), req.params.id, req.user.sub);
  if (!result.changes) return res.status(404).json({ error: 'Chat not found.' });
  res.json({ ok: true });
});

app.post('/api/chat', auth, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (!openai) return res.status(503).json({ error: 'AI is not configured. Add OPENAI_API_KEY to .env.' });
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions: 'You are Nexrun AI, a helpful, concise assistant. Answer clearly and safely.',
      input: message
    });
    res.json({ text: response.output_text || 'I could not generate a response.' });
  } catch (error) {
    console.error('OpenAI error:', error?.message || error);
    res.status(502).json({ error: 'AI request failed. Check your OpenAI configuration.' });
  }
});

app.get('/api/payments/config', (req, res) => res.json({ keyId: process.env.RAZORPAY_KEY_ID || null, amount: PRO_PLAN_AMOUNT_INR, currency: 'INR' }));

app.post('/api/payments/create-order', auth, async (req, res) => {
  if (!razorpay) return res.status(503).json({ error: 'Razorpay is not configured. Add Razorpay credentials to .env.' });
  try {
    const receipt = `nexrun_${req.user.sub}_${Date.now()}`;
    const order = await razorpay.orders.create({ amount: PRO_PLAN_AMOUNT_INR * 100, currency: 'INR', receipt });
    db.prepare('INSERT INTO payments (user_id,order_id,amount,currency,status) VALUES (?,?,?,?,?)')
      .run(req.user.sub, order.id, order.amount, order.currency, 'created');
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('Razorpay order error:', error?.message || error);
    res.status(502).json({ error: 'Could not create payment order.' });
  }
});

app.post('/api/payments/verify', auth, (req, res) => {
  const { orderId, paymentId, signature } = req.body || {};
  if (!orderId || !paymentId || !signature) return res.status(400).json({ error: 'Missing payment verification fields.' });
  try {
    if (!verifyRazorpaySignature(orderId, paymentId, signature)) return res.status(400).json({ error: 'Invalid payment signature.' });
    const payment = db.prepare('SELECT * FROM payments WHERE order_id=? AND user_id=?').get(orderId, req.user.sub);
    if (!payment) return res.status(404).json({ error: 'Payment order not found.' });
    db.prepare('UPDATE payments SET payment_id=?, status="paid" WHERE order_id=?').run(paymentId, orderId);
    db.prepare("UPDATE users SET plan='pro' WHERE id=?").run(req.user.sub);
    res.json({ ok: true, user: getUser(req.user.sub) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

app.listen(PORT, () => {
  console.log(`Nexrun AI running at http://localhost:${PORT}`);
});
