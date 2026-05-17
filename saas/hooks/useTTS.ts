// saas/hooks/useTTS.ts
// Client-side hook for calling the /api/tts endpoint.
// Manages loading, error, audio URL, and remaining quota state.

"use client";

import { useState, useCallback } from "react";

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

  const generate = useCallback(
    async (text: string, voiceId: string): Promise<TTSResponse | null> => {
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
        });

        const data = await res.json();

        if (!res.ok) {
          const err: TTSError = {
            message: data.error ?? "Generation failed",
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
        const message =
          err instanceof Error ? err.message : "Network error";
        setError({ message });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return { generate, loading, error, result, reset };
}
