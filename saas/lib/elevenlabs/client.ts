// saas/lib/elevenlabs/client.ts
// SERVER-SIDE ONLY. Never import this in a 'use client' component.
// Primary provider: ElevenLabs. Fallback provider: OpenAI speech, when OPENAI_API_KEY is set.

import { DEFAULT_MODEL_ID, findVoice } from "./voices";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ELEVENLABS_TIMEOUT_MS = 45_000;
const DEFAULT_OPENAI_TTS_TIMEOUT_MS = 45_000;

function getElevenLabsApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

function getOpenAiApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function getElevenLabsTimeoutMs(): number {
  const configured = Number(process.env.ELEVENLABS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_ELEVENLABS_TIMEOUT_MS;
}

function getOpenAiTimeoutMs(): number {
  const configured = Number(process.env.OPENAI_TTS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_OPENAI_TTS_TIMEOUT_MS;
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
 * Uses ElevenLabs when configured; falls back to OpenAI speech if ElevenLabs fails
 * and OPENAI_API_KEY exists. This keeps the Audio Studio usable even when one
 * provider key/voice/quota is misconfigured.
 */
export async function generateSpeech(opts: TTSOptions): Promise<ArrayBuffer> {
  const elevenLabsKey = getElevenLabsApiKey();
  const openAiKey = getOpenAiApiKey();
  let elevenLabsError: unknown = null;

  if (elevenLabsKey) {
    try {
      return await generateSpeechWithElevenLabs(opts, elevenLabsKey);
    } catch (err) {
      elevenLabsError = err;
      console.warn("ElevenLabs TTS failed; checking OpenAI fallback:", sanitizeProviderError(err));
    }
  } else {
    elevenLabsError = new Error("ELEVENLABS_API_KEY is not set");
  }

  if (openAiKey) {
    try {
      return await generateSpeechWithOpenAI(opts, openAiKey);
    } catch (openAiError) {
      throw new Error(
        `Speech generation failed. ElevenLabs: ${sanitizeProviderError(elevenLabsError)}. OpenAI fallback: ${sanitizeProviderError(openAiError)}`,
      );
    }
  }

  throw new Error(
    `Speech generation failed. ElevenLabs: ${sanitizeProviderError(elevenLabsError)}. OPENAI_API_KEY is not set for fallback.`,
  );
}

async function generateSpeechWithElevenLabs(opts: TTSOptions, apiKey: string): Promise<ArrayBuffer> {
  const {
    text,
    voiceId,
    modelId = DEFAULT_MODEL_ID,
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0,
  } = opts;

  const timeoutMs = getElevenLabsTimeoutMs();
  const res = await fetchWithTimeout(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
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
    timeoutMs,
    `ElevenLabs request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs error ${res.status}: ${errorText || res.statusText}`,
    );
  }

  return await res.arrayBuffer();
}

async function generateSpeechWithOpenAI(opts: TTSOptions, apiKey: string): Promise<ArrayBuffer> {
  const timeoutMs = getOpenAiTimeoutMs();
  const res = await fetchWithTimeout(
    `${OPENAI_BASE_URL}/audio/speech`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "tts-1",
        voice: mapOpenAiVoice(opts.voiceId),
        input: opts.text,
        response_format: "mp3",
      }),
    },
    timeoutMs,
    `OpenAI speech request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`OpenAI speech error ${res.status}: ${errorText || res.statusText}`);
  }

  return await res.arrayBuffer();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function mapOpenAiVoice(voiceId: string): string {
  const voice = findVoice(voiceId);
  if (!voice) return "alloy";

  if (voice.gender === "male") {
    return voice.locale === "en" ? "onyx" : "echo";
  }

  return voice.locale === "en" ? "nova" : "shimmer";
}

function sanitizeProviderError(error: unknown): string {
  if (!error) return "unknown";
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/xi-api-key[^,}\n]*/gi, "xi-api-key redacted")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer redacted")
    .slice(0, 800);
}
