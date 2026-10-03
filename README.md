# Nexrun AI — Full-Stack Starter

This version upgrades the original frontend into a Node.js full-stack starter.

## Included

- Existing Nexrun AI UI preserved
- Node.js + Express backend
- SQLite database with users, chats and payments
- Email/password authentication with bcrypt password hashing
- HttpOnly JWT session cookie
- OpenAI Responses API integration (server-side)
- Razorpay order + Checkout integration
- Razorpay payment signature verification
- Razorpay webhook verification
- Free/Pro plan state stored in the database
- `.env.example` for secrets

## 1. Install

Requires Node.js 20+.

```bash
npm install
```

## 2. Configure secrets

Copy `.env.example` to `.env` and fill in:

- `JWT_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-5-mini`)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `PRO_PLAN_AMOUNT_INR`

Never commit `.env`.

## 3. Run

```bash
npm start
```

Open `http://localhost:3000`.

## 4. Razorpay webhook

In Razorpay, create a webhook pointing to:

`https://YOUR-DOMAIN/api/payments/webhook`

Use the same value as `RAZORPAY_WEBHOOK_SECRET` in your server environment. The backend verifies the webhook HMAC before changing payment state.

## Payment flow

1. User signs in.
2. Nexrun asks the backend to create a Razorpay order.
3. Razorpay Checkout opens in the browser.
4. Checkout returns payment identifiers/signature.
5. Backend verifies the signature using the Razorpay secret.
6. The user's plan becomes `pro` in SQLite.
7. Webhooks provide an additional server-to-server payment event path.

## Important production work before launch

- Use HTTPS and a strong randomly generated `JWT_SECRET`.
- Use a managed PostgreSQL database instead of local SQLite for multiple server instances.
- Add rate limiting, CSRF protection appropriate to your deployment, email verification, password reset, account deletion, audit logging and abuse controls.
- Add subscription lifecycle handling if you want recurring monthly/yearly billing rather than the included one-time Pro order.
- Configure Razorpay production keys only after completing your merchant/KYC setup and testing the full payment lifecycle.
- Add server-side authorization for every Pro-only feature; do not rely on hiding frontend buttons.
- Set a restrictive Content Security Policy and other security headers for production.

## Notes

The OpenAI integration uses the Responses API. The old Assistants API was sunset in August 2026, so this project intentionally uses Responses instead.
