import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    // 1. Check for the key safely inside the request handler
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is missing from environment variables." },
        { status: 500 }
      );
    }

    // 2. Initialize OpenAI inside the function so it doesn't run during 'next build'
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 3. Your existing Text-to-Speech logic goes here
    // Example:
    // const body = await request.json();
    // const mp3 = await openai.audio.speech.create({ ... });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
