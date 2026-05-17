// saas/hooks/useSessionTimer.ts
// Tracks active session time using localStorage so it survives reloads.
// Fires a "long session" warning once the user crosses the threshold.
//
// IMPORTANT: This is the reliable trigger for "session is getting long" —
// do NOT rely on the AI assistant to self-report context limits. It can't.
// Time elapsed and turn count are the only trustworthy signals.

"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "sb_session_start";
const WARNED_KEY = "sb_session_warned";
const DEFAULT_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface UseSessionTimerOptions {
  thresholdMs?: number;
  /** Called once when threshold is crossed in a given session. */
  onThresholdReached?: () => void;
}

export interface UseSessionTimerReturn {
  /** Milliseconds since the session started. */
  elapsedMs: number;
  /** True when elapsedMs >= thresholdMs. */
  isLongSession: boolean;
  /** True if the warning has already been shown this session. */
  hasWarned: boolean;
  /** Reset the timer — call this when the user starts a "new session". */
  reset: () => void;
  /** Acknowledge the warning so it doesn't keep firing. */
  acknowledgeWarning: () => void;
}

export function useSessionTimer(
  options: UseSessionTimerOptions = {},
): UseSessionTimerReturn {
  const { thresholdMs = DEFAULT_THRESHOLD_MS, onThresholdReached } = options;

  const [elapsedMs, setElapsedMs] = useState(0);
  const [hasWarned, setHasWarned] = useState(false);

  // Initialize start time on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let start = window.localStorage.getItem(STORAGE_KEY);
    if (!start) {
      start = Date.now().toString();
      window.localStorage.setItem(STORAGE_KEY, start);
    }

    setHasWarned(window.localStorage.getItem(WARNED_KEY) === "1");

    const tick = () => {
      const startNum = Number(start);
      if (!Number.isFinite(startNum)) return;
      setElapsedMs(Date.now() - startNum);
    };

    tick();
    const id = window.setInterval(tick, 30_000); // every 30s is enough
    return () => window.clearInterval(id);
  }, []);

  // Fire onThresholdReached exactly once per session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (elapsedMs < thresholdMs) return;
    if (hasWarned) return;

    window.localStorage.setItem(WARNED_KEY, "1");
    setHasWarned(true);
    onThresholdReached?.();
  }, [elapsedMs, thresholdMs, hasWarned, onThresholdReached]);

  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    const now = Date.now().toString();
    window.localStorage.setItem(STORAGE_KEY, now);
    window.localStorage.removeItem(WARNED_KEY);
    setElapsedMs(0);
    setHasWarned(false);
  }, []);

  const acknowledgeWarning = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WARNED_KEY, "1");
    setHasWarned(true);
  }, []);

  return {
    elapsedMs,
    isLongSession: elapsedMs >= thresholdMs,
    hasWarned,
    reset,
    acknowledgeWarning,
  };
}
