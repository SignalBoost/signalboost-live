'use client'

import { useEffect, useState } from 'react'

type PreviewUsage = {
  count: number
  updatedAt: string
}

const storageKey = 'signalboost:free-video-preview-plays:v1'

function readUsage(): PreviewUsage {
  if (typeof window === 'undefined') {
    return { count: 0, updatedAt: new Date().toISOString() }
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return { count: 0, updatedAt: new Date().toISOString() }

    const parsed = JSON.parse(raw) as Partial<PreviewUsage>

    return {
      count: Number(parsed.count || 0),
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
    }
  } catch {
    return { count: 0, updatedAt: new Date().toISOString() }
  }
}

function writeUsage(usage: PreviewUsage) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(storageKey, JSON.stringify(usage))
}

export default function PreviewLimitGuard({
  limit = 3,
  enabled = true,
}: {
  limit?: number
  enabled?: boolean
}) {
  const [message, setMessage] = useState('')
  const [remaining, setRemaining] = useState(limit)

  useEffect(() => {
    if (!enabled) return

    const initialUsage = readUsage()
    setRemaining(Math.max(0, limit - initialUsage.count))

    function handlePlay(event: Event) {
      const video = event.target

      if (!(video instanceof HTMLVideoElement)) return

      // Do not count repeated play events while the same playback session is active.
      if (video.dataset.signalboostPreviewPlaying === 'true') return

      const usage = readUsage()

      if (usage.count >= limit) {
        event.preventDefault()
        video.pause()

        setRemaining(0)
        setMessage('Free preview limit reached. Upgrade to continue previewing and exporting videos.')

        return
      }

      const nextCount = usage.count + 1

      writeUsage({
        count: nextCount,
        updatedAt: new Date().toISOString(),
      })

      video.dataset.signalboostPreviewPlaying = 'true'

      const nextRemaining = Math.max(0, limit - nextCount)

      setRemaining(nextRemaining)
      setMessage(`Free preview ${nextCount}/${limit}. ${nextRemaining} preview${nextRemaining === 1 ? '' : 's'} remaining.`)
    }

    function handleStop(event: Event) {
      const video = event.target

      if (!(video instanceof HTMLVideoElement)) return

      video.dataset.signalboostPreviewPlaying = 'false'
    }

    document.addEventListener('play', handlePlay, true)
    document.addEventListener('pause', handleStop, true)
    document.addEventListener('ended', handleStop, true)

    return () => {
      document.removeEventListener('play', handlePlay, true)
      document.removeEventListener('pause', handleStop, true)
      document.removeEventListener('ended', handleStop, true)
    }
  }, [enabled, limit])

  if (!enabled || !message) return null

  return (
    <div className="fixed bottom-5 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-[#FFD700]/30 bg-black/90 p-4 text-sm text-white shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-[#FFD700]">Free preview limit</p>
          <p className="mt-1 text-white/80">{message}</p>
          <p className="mt-1 text-xs text-white/50">Remaining previews: {remaining}</p>
        </div>

        <button
          type="button"
          onClick={() => setMessage('')}
          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </div>
  )
}
