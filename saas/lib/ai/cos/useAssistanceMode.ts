// saas/lib/ai/cos/useAssistanceMode.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  ASSISTANCE_MODE_METADATA_KEY, ASSISTANCE_MODE_STORAGE_KEY, DEFAULT_ASSISTANCE_MODE,
  normalizeAssistanceMode, type AssistanceMode,
} from './assistanceMode'

function cached(): AssistanceMode | null {
  try { return normalizeAssistanceMode(window.localStorage.getItem(ASSISTANCE_MODE_STORAGE_KEY)) } catch { return null }
}
function cache(mode: AssistanceMode) {
  try { window.localStorage.setItem(ASSISTANCE_MODE_STORAGE_KEY, mode) } catch { /* private window: the account copy still holds it */ }
}

/**
 * The user's assistance mode, chosen once and remembered: on the signed-in account (so it follows the user to every
 * device and the server can read it) and in this browser (instant first render, and the only copy for visitors).
 */
export function useAssistanceMode(): readonly [AssistanceMode, (mode: AssistanceMode) => void] {
  const [mode, setModeState] = useState<AssistanceMode>(DEFAULT_ASSISTANCE_MODE)

  useEffect(() => {
    let active = true
    const local = cached()
    if (local) setModeState(local)
    void supabase.auth.getUser().then(({ data }: { data: { user: { user_metadata?: Record<string, unknown> } | null } }) => {
      const stored = normalizeAssistanceMode(data?.user?.user_metadata?.[ASSISTANCE_MODE_METADATA_KEY])
      if (!active) return
      if (stored) {
        setModeState(stored)
        cache(stored)
      } else if (local && data?.user) {
        // Chosen before signing in: carry it to the account.
        void supabase.auth.updateUser({ data: { [ASSISTANCE_MODE_METADATA_KEY]: local } }).catch(() => undefined)
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const setMode = useCallback((next: AssistanceMode) => {
    setModeState(next)
    cache(next)
    void supabase.auth.getUser().then(({ data }: { data: { user: unknown } }) => {
      if (data?.user) return supabase.auth.updateUser({ data: { [ASSISTANCE_MODE_METADATA_KEY]: next } })
    }).catch(() => undefined)
  }, [])

  return [mode, setMode] as const
}
