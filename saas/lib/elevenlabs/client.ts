// saas/lib/elevenlabs/client.ts
// SERVER-SIDE ONLY. Never import this in a 'use client' component.
// Primary provider: ElevenLabs. Fallback provider: OpenAI speech, when OPENAI_API_KEY is set.

import { DEFAULT_MODEL_ID, findVoice } from "./voices";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const GENERATE_SPEECH_TIMEOUT_MS = 15_000;
const OPENAI_TTS_HD_MODEL = "tts-1-hd";

function getElevenLabsApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

function getOpenAiApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

function getProviderTimeoutMs(envName: "ELEVENLABS_TIMEOUT_MS" | "OPENAI_TTS_TIMEOUT_MS"): number {
  const configured = Number(process.env[envName]);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, DEFAULT_PROVIDER_TIMEOUT_MS)
    : DEFAULT_PROVIDER_TIMEOUT_MS;
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
 * Uses ElevenLabs when configured; falls back to OpenAI high-definition speech
 * if ElevenLabs fails and OPENAI_API_KEY exists. Provider calls are capped at
 * 10 seconds and the full wrapper is capped at 15 seconds so background
 * rendering workers fail fast instead of hanging.
 */
export async function generateSpeech(opts: TTSOptions): Promise<ArrayBuffer> {
  return await withTimeout(
    generateSpeechFromProviders(opts),
    GENERATE_SPEECH_TIMEOUT_MS,
    `Speech generation timed out after ${Math.round(GENERATE_SPEECH_TIMEOUT_MS / 1000)} seconds`,
  );
}

async function generateSpeechFromProviders(opts: TTSOptions): Promise<ArrayBuffer> {
  const elevenLabsKey = getElevenLabsApiKey();
  const openAiKey = getOpenAiApiKey();
  let elevenLabsError: unknown = null;

  if (elevenLabsKey) {
    try {
      return await generateSpeechWithElevenLabs(opts, elevenLabsKey);
    } catch (err) {
      elevenLabsError = err;
      console.warn(
        `[TTS Warning] ElevenLabs failed (${diagnoseProviderError(err)}).`,
        sanitizeProviderError(err),
      );
    }
  } else {
    elevenLabsError = new Error("ELEVENLABS_API_KEY is not set");
    console.warn("[TTS Warning] ElevenLabs skipped because ELEVENLABS_API_KEY is not set.");
  }

  if (!openAiKey) {
    const message = `Speech generation failed. ElevenLabs: ${sanitizeProviderError(elevenLabsError)}. OPENAI_API_KEY is not set for fallback.`;
    console.error(`[TTS Error] ${message}`);
    throw new Error(message);
  }

  console.warn("[TTS Warning] ElevenLabs failed. Falling back to OpenAI tts-1-hd...");

  try {
    return await generateSpeechWithOpenAI(opts, openAiKey);
  } catch (openAiError) {
    const message = `Speech generation failed. ElevenLabs: ${sanitizeProviderError(elevenLabsError)}. OpenAI tts-1-hd fallback: ${sanitizeProviderError(openAiError)}`;
    console.error(`[TTS Error] ${message}`);
    throw new Error(message);
  }
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

  const timeoutMs = getProviderTimeoutMs("ELEVENLABS_TIMEOUT_MS");
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
      `ElevenLabs ${describeHttpStatus(res.status)}: ${errorText || res.statusText}`,
    );
  }

  return await res.arrayBuffer();
}

async function generateSpeechWithOpenAI(opts: TTSOptions, apiKey: string): Promise<ArrayBuffer> {
  const timeoutMs = getProviderTimeoutMs("OPENAI_TTS_TIMEOUT_MS");
  const res = await fetchWithTimeout(
    `${OPENAI_BASE_URL}/audio/speech`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_TTS_HD_MODEL,
        voice: mapOpenAiVoice(opts.voiceId),
        input: opts.text,
        response_format: "mp3",
      }),
    },
    timeoutMs,
    `OpenAI tts-1-hd request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`OpenAI tts-1-hd ${describeHttpStatus(res.status)}: ${errorText || res.statusText}`);
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

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
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

function describeHttpStatus(status: number): string {
  if (status === 401) return "error 401 (unauthorized - check API key)";
  if (status === 429) return "error 429 (rate limited or quota exceeded)";
  if (status >= 500) return `error ${status} (provider server error)`;
  return `error ${status}`;
}

function diagnoseProviderError(error: unknown): string {
  const message = sanitizeProviderError(error).toLowerCase();
  if (message.includes("401") || message.includes("unauthorized")) return "401 unauthorized";
  if (message.includes("429") || message.includes("rate limit") || message.includes("quota")) return "429 rate limit or quota";
  if (message.includes("timed out") || message.includes("abort")) return "timeout";
  return "provider error";
}

function sanitizeProviderError(error: unknown): string {
  if (!error) return "unknown";
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/xi-api-key[^,}\n]*/gi, "xi-api-key redacted")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer redacted")
    .slice(0, 800);
}
