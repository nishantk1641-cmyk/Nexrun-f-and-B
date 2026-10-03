# Nexrun AI — Supabase Full-Stack

This build converts the original SQLite authentication/database layer to **Supabase Auth + Postgres** while keeping the Nexrun UI, OpenAI backend and Razorpay checkout.

## Architecture

- Supabase Auth: email/password signup, login and sessions
- Supabase Postgres: `profiles`, `chats`, `payments`
- Node.js/Express: secure OpenAI and Razorpay server endpoints
- Razorpay: order creation, signature verification and webhook handling
- Browser: only the Supabase publishable/anon key is exposed
- Server: Supabase service-role key, OpenAI key and Razorpay secret stay in `.env`

## Setup

1. In Supabase SQL Editor, run `supabase-schema.sql`.
2. Copy `.env.example` to `.env`.
3. Put your Supabase project URL in both `.env` and `config.js`.
4. Put your Supabase **publishable/anon key** in `config.js`.
5. Put your Supabase **service-role/secret key** only in `.env`.
6. Add your OpenAI and Razorpay credentials to `.env`.
7. Run:

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Supabase Auth email confirmation

If email confirmation is enabled in Supabase Auth, new users must confirm their email before a session is created. For quick local testing you can disable confirmation in the Supabase Auth settings.

## Razorpay webhook

Set the webhook URL to:

`https://YOUR-DOMAIN/api/payments/webhook`

and use the same webhook secret in `RAZORPAY_WEBHOOK_SECRET`.

## Security

Never put `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, or `OPENAI_API_KEY` in `config.js`, `app.js`, `index.html`, or any public GitHub repository.
