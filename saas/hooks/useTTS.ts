// saas/hooks/useTTS.ts
// Client-side hook for calling the /api/tts endpoint.
// Manages loading, error, audio URL, and remaining quota state.

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const TTS_CLIENT_TIMEOUT_MS = 60_000;

export interface TTSResponse {
  audioUrl: string;
  cached: boolean;
  characters: number;
  remaining: number;
}

export interface TTSError {
  message: string;
  status?: number;
  remaining?: number;
  monthlyLimit?: number;
}

export interface UseTTSReturn {
  generate: (text: string, voiceId: string) => Promise<TTSResponse | null>;
  loading: boolean;
  error: TTSError | null;
  result: TTSResponse | null;
  reset: () => void;
}

export function useTTS(): UseTTSReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TTSError | null>(null);
  const [result, setResult] = useState<TTSResponse | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => activeRequestRef.current?.abort();
  }, []);

  const generate = useCallback(
    async (text: string, voiceId: string): Promise<TTSResponse | null> => {
      activeRequestRef.current?.abort();

      const controller = new AbortController();
      activeRequestRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), TTS_CLIENT_TIMEOUT_MS);

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const err: TTSError = {
            message: data.error ?? "errors.generationFailed",
            status: res.status,
            remaining: data.remaining,
            monthlyLimit: data.monthlyLimit,
          };
          setError(err);
          return null;
        }

        setResult(data);
        return data;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setError({ message: "Audio generation timed out. Please try again with shorter text or try again in a minute." });
          return null;
        }

        const message =
          err instanceof Error ? err.message : "errors.networkError";
        setError({ message });
        return null;
      } finally {
        window.clearTimeout(timeout);
        if (activeRequestRef.current === controller) activeRequestRef.current = null;
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { generate, loading, error, result, reset };
}
