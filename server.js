import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import OpenAI from 'openai';
import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRO_PLAN_AMOUNT_INR = Number(process.env.PRO_PLAN_AMOUNT_INR || 499);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.');
}
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

function cleanEmail(email) { return String(email || '').trim().toLowerCase(); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function timingSafeHex(expected, received) {
  if (!received || expected.length !== String(received).length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(received)));
}
async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('id,name,email,plan,created_at').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
async function auth(req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Supabase is not configured.' });
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (error) {
    console.error('Auth error:', error?.message || error);
    return res.status(401).json({ error: 'Invalid authentication session.' });
  }
}

// Razorpay webhook needs the raw request body for HMAC verification.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).send('Webhook secret not configured');
  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest('hex');
  if (!timingSafeHex(expected, signature)) return res.status(400).send('Invalid signature');
  try {
    const event = JSON.parse(req.body.toString('utf8'));
    const paymentEntity = event?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;
    const paymentId = paymentEntity?.id;
    if (orderId && supabase) {
      const { data: payment } = await supabase.from('payments').select('*').eq('order_id', orderId).maybeSingle();
      if (payment) {
        const status = event.event === 'payment.captured' ? 'paid' : event.event === 'payment.failed' ? 'failed' : payment.status;
        await supabase.from('payments').update({ payment_id: paymentId || payment.payment_id, status }).eq('order_id', orderId);
        if (status === 'paid') await supabase.from('profiles').update({ plan: 'pro' }).eq('id', payment.user_id);
      }
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error?.message || error);
    return res.status(400).send('Invalid webhook');
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'nexrun-api', database: supabase ? 'supabase' : 'not-configured' }));

// Auth is handled by Supabase Auth in the browser. The server only validates the Supabase access token.
app.post('/api/auth/sync-profile', auth, async (req, res) => {
  try {
    const name = String(req.body?.name || req.user.user_metadata?.name || 'User').trim().slice(0, 100) || 'User';
    const email = cleanEmail(req.user.email);
    const { data, error } = await supabase.from('profiles').upsert({ id: req.user.id, name, email }, { onConflict: 'id' }).select('id,name,email,plan,created_at').single();
    if (error) throw error;
    res.json({ user: data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not sync profile.' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try { res.json({ user: await getProfile(req.user.id) }); }
  catch (error) { console.error(error); res.status(500).json({ error: 'Could not load profile.' }); }
});

app.get('/api/chats', auth, async (req, res) => {
  const { data, error } = await supabase.from('chats').select('id,title,created_at,updated_at').eq('user_id', req.user.id).order('updated_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: 'Could not load chats.' });
  res.json({ chats: data || [] });
});

app.get('/api/chats/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('chats').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load chat.' });
  if (!data) return res.status(404).json({ error: 'Chat not found.' });
  res.json({ ...data, messages: data.messages || [] });
});

app.post('/api/chats', auth, async (req, res) => {
  const title = String(req.body?.title || 'New chat').slice(0, 120);
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [];
  const { data, error } = await supabase.from('chats').insert({ user_id: req.user.id, title, messages }).select('id').single();
  if (error) return res.status(500).json({ error: 'Could not save chat.' });
  res.status(201).json({ id: data.id });
});

app.put('/api/chats/:id', auth, async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [];
  const title = String(req.body?.title || 'New chat').slice(0, 120);
  const { data, error } = await supabase.from('chats').update({ title, messages, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not update chat.' });
  if (!data) return res.status(404).json({ error: 'Chat not found.' });
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
    const receipt = `nexrun_${req.user.id.slice(0, 8)}_${Date.now()}`;
    const order = await razorpay.orders.create({ amount: PRO_PLAN_AMOUNT_INR * 100, currency: 'INR', receipt });
    const { error } = await supabase.from('payments').insert({ user_id: req.user.id, order_id: order.id, amount: order.amount, currency: order.currency, status: 'created' });
    if (error) throw error;
    const profile = await getProfile(req.user.id);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, name: profile?.name, email: profile?.email });
  } catch (error) {
    console.error('Razorpay order error:', error?.message || error);
    res.status(502).json({ error: 'Could not create payment order.' });
  }
});

app.post('/api/payments/verify', auth, async (req, res) => {
  const { orderId, paymentId, signature } = req.body || {};
  if (!orderId || !paymentId || !signature) return res.status(400).json({ error: 'Missing payment verification fields.' });
  try {
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex');
    if (!timingSafeHex(expected, signature)) return res.status(400).json({ error: 'Invalid payment signature.' });
    const { data: payment, error: lookupError } = await supabase.from('payments').select('*').eq('order_id', orderId).eq('user_id', req.user.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!payment) return res.status(404).json({ error: 'Payment order not found.' });
    const { error: paymentError } = await supabase.from('payments').update({ payment_id: paymentId, status: 'paid' }).eq('order_id', orderId).eq('user_id', req.user.id);
    if (paymentError) throw paymentError;
    const { error: profileError } = await supabase.from('profiles').update({ plan: 'pro' }).eq('id', req.user.id);
    if (profileError) throw profileError;
    res.json({ ok: true, user: await getProfile(req.user.id) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

app.listen(PORT, () => console.log(`Nexrun AI running at http://localhost:${PORT}`));
