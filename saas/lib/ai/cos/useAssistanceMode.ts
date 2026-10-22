// saas/lib/ai/cos/useAssistanceMode.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  ASSISTANCE_MODE_METADATA_KEY, ASSISTANCE_MODE_STORAGE_KEY, DEFAULT_ASSISTANCE_MODE,
  normalizeAssistanceMode, type AssistanceMode,
} from './assistanceMode.ts'

// Each signed-in user's choice is cached under their own id; a visitor's choice is the only unkeyed one. A browser
// shared by two accounts therefore never hands one account's execution preference to the other (Codex on #4765).
const keyFor = (userId: string | null) => userId ? `${ASSISTANCE_MODE_STORAGE_KEY}:${userId}` : ASSISTANCE_MODE_STORAGE_KEY
function read(key: string): AssistanceMode | null {
  try { return normalizeAssistanceMode(window.localStorage.getItem(key)) } catch { return null }
}
function write(key: string, mode: AssistanceMode | null) {
  try { mode ? window.localStorage.setItem(key, mode) : window.localStorage.removeItem(key) } catch { /* private window: the account copy still holds it */ }
}

/**
 * The user's assistance mode, chosen once and remembered: on the signed-in account (so it follows the user to every
 * device and the server can read it) and in this browser per user (instant render). Visitors keep it in the browser.
 */
export function useAssistanceMode(): readonly [AssistanceMode, (mode: AssistanceMode) => void] {
  const [mode, setModeState] = useState<AssistanceMode>(DEFAULT_ASSISTANCE_MODE)
  const user = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    void supabase.auth.getUser().then(({ data }: { data: { user: { id?: string; user_metadata?: Record<string, unknown> } | null } }) => {
      if (!active) return
      const userId = typeof data?.user?.id === 'string' ? data.user.id : null
      user.current = userId
      if (!userId) {
        const visitor = read(keyFor(null))
        if (visitor) setModeState(visitor)
        return
      }
      const saved = normalizeAssistanceMode(data?.user?.user_metadata?.[ASSISTANCE_MODE_METADATA_KEY]) ?? read(keyFor(userId))
      if (saved) {
        setModeState(saved)
        write(keyFor(userId), saved)
        return
      }
      // A choice made while signed out moves to the account that signs in next, once, then leaves the browser.
      const visitor = read(keyFor(null))
      if (!visitor) return
      setModeState(visitor)
      write(keyFor(userId), visitor)
      write(keyFor(null), null)
      void supabase.auth.updateUser({ data: { [ASSISTANCE_MODE_METADATA_KEY]: visitor } }).catch(() => undefined)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const setMode = useCallback((next: AssistanceMode) => {
    setModeState(next)
    write(keyFor(user.current), next)
    if (user.current) void supabase.auth.updateUser({ data: { [ASSISTANCE_MODE_METADATA_KEY]: next } }).catch(() => undefined)
  }, [])

  return [mode, setMode] as const
}
