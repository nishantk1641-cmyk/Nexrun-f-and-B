# Nexrun AI — AI-Powered Vibe Coding Platform

Nexrun AI is an ultra-minimal, high-performance vibe coding platform designed for beginners and experienced developers. Describe any app or website idea in natural language, and Nexrun AI generates clean, working HTML, CSS, and JavaScript with live preview and project management.

---

## Architecture Overview

```
Frontend (SPA Web App / Android WebView)
       │
       ▼
Firebase Authentication (Email / Password)
       │
       ▼
Firestore (`users/{uid}` & `users/{uid}/projects/{projectId}`)
       │
       ▼
Firebase Callable Cloud Function v2 (`nexrunAI`)
       │
       ▼
Firebase Secret Manager (`GEMINI_API_KEY`)
       │
       ▼
Google Gemini API (Generative AI)
```

---

## 1. Firebase Authentication Setup

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select or create the project: **`nexrun-ai`**.
3. In the left navigation, go to **Build > Authentication**.
4. Click **Get Started** (if not already enabled).
5. Under the **Sign-in method** tab:
   - Select **Email/Password**.
   - Enable **Email/Password** (keep "Email link" disabled unless desired).
   - Click **Save**.
6. Under **Settings > Authorized domains**, ensure your local domain (`localhost`), Firebase Hosting domain (`nexrun-ai.web.app` / `nexrun-ai.firebaseapp.com`), and emulator domains are listed.

---

## 2. Cloud Firestore Setup

1. In the Firebase Console, navigate to **Build > Firestore Database**.
2. Click **Create Database**.
3. Choose your database location (e.g., `us-central1`).
4. Select **Start in production mode**.
5. Once created, deploy the provided security rules from `firestore.rules` (see step 6 below).

### Data Schema
- **User Profile**: `users/{uid}`
  ```json
  {
    "email": "user@example.com",
    "plan": "free",
    "subscriptionStatus": "inactive",
    "createdAt": "serverTimestamp",
    "lastAIRequestAt": "serverTimestamp"
  }
  ```
- **User Projects**: `users/{uid}/projects/{projectId}`
  ```json
  {
    "title": "Modern Portfolio",
    "description": "Clean designer portfolio",
    "html": "...",
    "css": "...",
    "js": "...",
    "createdAt": "serverTimestamp",
    "updatedAt": "serverTimestamp"
  }
  ```

---

## 3. Firebase CLI Setup

1. Install the Firebase CLI globally via npm:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to your Firebase account:
   ```bash
   firebase login
   ```
3. Set the active project to `nexrun-ai`:
   ```bash
   firebase use nexrun-ai
   ```

---

## 4. Gemini API Key Creation

1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click **Get API key** and generate a new key for the project.
4. Keep this key secure; do not share or commit it into frontend files.

---

## 5. Secret Manager Setup

Store your Gemini API key in Google Cloud / Firebase Secret Manager so the Cloud Function can securely access it:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

When prompted, paste your Gemini API key. Firebase will automatically grant secret accessor permissions to the Cloud Functions service account.

---

## 6. Function Deployment

1. Change directory to `functions`:
   ```bash
   cd functions
   npm install
   cd ..
   ```
2. Deploy the `nexrunAI` Cloud Function and Firestore security rules:
   ```bash
   firebase deploy --only functions,firestore:rules
   ```

---

## 7. Hosting Deployment

1. Deploy the frontend to Firebase Hosting:
   ```bash
   firebase deploy --only hosting
   ```
2. Your application will be live at:
   - `https://nexrun-ai.web.app`
   - `https://nexrun-ai.firebaseapp.com`

---

## 8. Testing the AI Builder

1. Open the deployed application or run it in your local browser.
2. Sign up with a new email and password.
3. Once in the dashboard, navigate to **AI Builder**.
4. Enter an idea such as:
   > *"Create a sleek Pomodoro timer with start, pause, and reset controls."*
5. Click **Generate with AI**.
6. The AI engine generates the HTML, CSS, and JS, automatically places them into the **Code Editor**, and immediately activates the **Live Preview**.
7. Test the interactive preview in both Desktop and Mobile preview modes.

---

## 9. Troubleshooting Common Errors

### Error: `unauthenticated`
- **Cause**: User session is not active or token has expired.
- **Fix**: Log out and log back in to refresh the Firebase Auth JWT.

### Error: `failed-precondition` (Secret missing)
- **Cause**: The `GEMINI_API_KEY` secret is not configured in Firebase Secret Manager.
- **Fix**: Run `firebase functions:secrets:set GEMINI_API_KEY` and re-deploy functions.

### Error: `permission-denied` in Firestore
- **Cause**: Firestore rules are not deployed or the user is trying to access another user's document.
- **Fix**: Run `firebase deploy --only firestore:rules` and verify you are querying under `users/${currentUser.uid}`.

### Error: `CORS policy` or network errors in local development
- **Cause**: Domain is not authorized in Firebase Authentication or functions are deployed in a different region.
- **Fix**: Add `localhost` and `127.0.0.1` to Firebase Console > Authentication > Settings > Authorized Domains.
