// /pages/api/generate.js

import jwt from "jsonwebtoken";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Validate Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");

    // 2. Verify token (replace with your JWT secret)
    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 3. Parse request body
    const { prompt, language, type } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    // 4. (Optional) Permission checks
    // if (user.role !== "premium") {
    //   return res.status(403).json({ error: "Forbidden" });
    // }

    // 5. AI generation (placeholder)
    // Replace this with OpenAI, Groq, Gemini, etc.
    const output = `AI response for: ${prompt} (language: ${language}, type: ${type})`;

    // 6. Return success
    return res.status(200).json({
      success: true,
      output,
      user: user.email || user.id,
    });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
}
