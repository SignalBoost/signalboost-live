// saas/lib/elevenlabs/client.ts
// SERVER-SIDE ONLY. Never import this in a 'use client' component.
// Reads ELEVENLABS_API_KEY from process.env (set in Vercel env vars).

import { DEFAULT_MODEL_ID } from "./voices";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_ELEVENLABS_TIMEOUT_MS = 45_000;

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.",
    );
  }
  return key;
}

function getTimeoutMs(): number {
  const configured = Number(process.env.ELEVENLABS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_ELEVENLABS_TIMEOUT_MS;
}

export interface TTSOptions {
  text: string;
  voiceId: string;
  modelId?: string;
  /** 0.0–1.0. Higher = more consistent voice, lower = more expressive. */
  stability?: number;
  /** 0.0–1.0. Higher = closer to the original voice. */
  similarityBoost?: number;
  /** 0.0–1.0. 0 = no stylistic exaggeration. */
  style?: number;
}

/**
 * Generate speech from text. Returns the MP3 as an ArrayBuffer.
 * Throws on any non-2xx response with the API's error message.
 */
export async function generateSpeech(opts: TTSOptions): Promise<ArrayBuffer> {
  const {
    text,
    voiceId,
    modelId = DEFAULT_MODEL_ID,
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0,
  } = opts;

  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": getApiKey(),
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: true,
          },
        }),
      },
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`ElevenLabs request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs error ${res.status}: ${errorText || res.statusText}`,
    );
  }

  return await res.arrayBuffer();
}
