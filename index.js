const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
const db = admin.firestore();

// Define Gemini API key from Firebase Secret Manager
const geminiApiKey = defineSecret("GEMINI_API_KEY");

/**
 * Nexrun AI - AI Callable Cloud Function v2
 * Exports: exports.nexrunAI
 */
exports.nexrunAI = onCall(
  {
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
  },
  async (request) => {
    // 1. Verify Firebase authentication
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required to access Nexrun AI services."
      );
    }

    const uid = request.auth.uid;
    const { mode = "builder", prompt, currentCode } = request.data || {};

    // 5. Validate the prompt
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "A valid non-empty prompt is required."
      );
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length > 5000) {
      throw new HttpsError(
        "invalid-argument",
        "Prompt exceeds the maximum allowed length of 5000 characters."
      );
    }

    // 3. Read the user's Firestore profile
    let plan = "free";
    const userRef = db.collection("users").doc(uid);
    try {
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        // 4. Detect the user's plan
        plan = userData.plan || "free";
      } else {
        // Automatically initialize profile if not existing
        await userRef.set({
          email: request.auth.token.email || "",
          plan: "free",
          subscriptionStatus: "inactive",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastAIRequestAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn("Could not read user profile from Firestore:", err.message);
    }

    // Retrieve Gemini API Key from Secret Manager
    const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "GEMINI_API_KEY secret is not configured in Firebase Secret Manager."
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use modern Gemini 1.5 flash for fast code generation
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    let systemInstruction = "";
    let formattedUserPrompt = "";

    if (mode === "builder") {
      systemInstruction = `You are Nexrun AI, an elite vibe coding engine. 
Generate a complete, fully functional, modern and visually stunning web application or website according to the user's prompt.
Design philosophy: Minimal, clean, premium typography, smooth interaction, modern aesthetics.
Respond ONLY with a valid JSON object matching this schema:
{
  "title": "Short descriptive title of the project",
  "description": "One sentence summary of the project",
  "html": "Complete HTML markup (body contents or full document structure, clean semantic elements)",
  "css": "Complete, beautiful, responsive CSS styling",
  "js": "Complete, working JavaScript logic with full event listeners and interactivity"
}`;

      formattedUserPrompt = `User Request: "${trimmedPrompt}"
Generate a complete, production-ready, beautiful web project in JSON format with title, description, html, css, and js fields.`;
    } else if (mode === "assistant") {
      systemInstruction = `You are Nexrun AI Assistant, an expert programming mentor for vibe coders.
Provide clear, concise, actionable advice and code answers.
Respond ONLY with a valid JSON object matching this schema:
{
  "answer": "Clear explanation and breakdown answering the user's question",
  "code": "Optional clean code block snippet or solution (empty string if not applicable)"
}`;

      let contextInfo = "";
      if (currentCode && (currentCode.html || currentCode.css || currentCode.js)) {
        contextInfo = `\nCurrent Project Context:
HTML: ${currentCode.html ? currentCode.html.slice(0, 1500) : ""}
CSS: ${currentCode.css ? currentCode.css.slice(0, 1000) : ""}
JS: ${currentCode.js ? currentCode.js.slice(0, 1000) : ""}`;
      }

      formattedUserPrompt = `User Question: "${trimmedPrompt}"${contextInfo}`;
    } else {
      // mode === 'code'
      systemInstruction = `You are Nexrun AI Code Generator.
Analyze the user's code request or bug fix request.
Respond ONLY with a valid JSON object matching this schema:
{
  "answer": "Explanation of changes or solution",
  "code": "Updated or generated code snippet"
}`;

      formattedUserPrompt = `Task: "${trimmedPrompt}"`;
    }

    try {
      // 6. Send the request to Gemini
      const promptPayload = `${systemInstruction}\n\n${formattedUserPrompt}`;
      const result = await model.generateContent(promptPayload);
      const rawText = result.response.text();

      // Clean raw text in case of markdown tags
      let cleanJson = rawText.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const parsedData = JSON.parse(cleanJson);

      // 8. Update "lastAIRequestAt" in Firestore
      try {
        await userRef.update({
          lastAIRequestAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        // Non-fatal if update fails
      }

      // 7. Return structured JSON
      return {
        success: true,
        mode,
        plan,
        data: parsedData,
      };
    } catch (err) {
      console.error("Gemini API Error:", err);
      throw new HttpsError(
        "internal",
        "Failed to generate code with Gemini AI: " + (err.message || "Unknown error")
      );
    }
  }
);
