import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

// OPTIONAL: replace with your AI provider
// import OpenAI from "openai";
// const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req) {
  try {
    // 1. Parse request body
    const { prompt, language, type } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    // 2. Validate Authorization header
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // 3. Verify token (replace with your secret)
    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // 4. (Optional) Check user permissions
    // if (!user.role || user.role !== "premium") {
    //   return NextResponse.json(
    //     { error: "Forbidden" },
    //     { status: 403 }
    //   );
    // }

    // 5. Call your AI provider
    // const aiResponse = await client.chat.completions.create({
    //   model: "gpt-4o-mini",
    //   messages: [
    //     { role: "system", content: `Language: ${language}, Type: ${type}` },
    //     { role: "user", content: prompt }
    //   ]
    // });

    // const output = aiResponse.choices[0].message.content;

    // TEMPORARY RESPONSE (until you plug in your AI provider)
    const output = `AI response for: ${prompt} (language: ${language}, type: ${type})`;

    // 6. Return result
    return NextResponse.json({
      success: true,
      output,
      user: user.email,
    });

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
