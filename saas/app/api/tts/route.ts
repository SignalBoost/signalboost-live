import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize the OpenAI client using the secure environment variable
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    // 1. Parse the incoming request data
    const { text, voice } = await request.json();

    // Validation check
    if (!text) {
      return NextResponse.json(
        { error: 'Text content is required for text-to-speech generation.' },
        { status: 400 }
      );
    }

    // 2. Request audio generation from OpenAI's TTS engine
    // Defaulting to 'alloy' if no specific voice mapping is passed
    const mp3Response = await client.audio.speech.create({
      model: 'tts-1',
      voice: voice || 'alloy',
      input: text,
    });

    // 3. Convert the audio binary data into a buffer
    const buffer = Buffer.from(await mp3Response.arrayBuffer());

    // 4. Return the raw audio stream directly to your frontend components
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error: any) {
    console.error('Error generating text-to-speech:', error);
    return NextResponse.json(
      { error: 'Failed to process Text-to-Speech request', details: error.message },
      { status: 500 }
    );
  }
}
