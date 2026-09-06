'use client'

import { useEffect, useRef, useState } from 'react'
import { VOICE_INPUT_COPY } from '@/lib/i18n/dashboardCopy'

type VoiceLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionErrorEventLike = { error?: string }

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export default function VoiceInputButton({
  lang,
  value,
  onChange,
  disabled = false,
  className,
  style,
}: {
  lang: VoiceLang
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const baseValueRef = useRef('')

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))
    return () => recognitionRef.current?.abort()
  }, [])

  function stop() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  function toggle() {
    if (listening) {
      stop()
      return
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) return

    setError('')
    baseValueRef.current = value.trimEnd()
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = VOICE_INPUT_COPY[lang].locale
    recognition.onresult = event => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0]?.transcript || ''
      const separator = baseValueRef.current && transcript.trim() ? ' ' : ''
      onChange(`${baseValueRef.current}${separator}${transcript.trimStart()}`)
    }
    recognition.onerror = event => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? VOICE_INPUT_COPY[lang].denied : VOICE_INPUT_COPY[lang].failed)
      }
      setListening(false)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const label = !supported ? VOICE_INPUT_COPY[lang].unavailable : listening ? VOICE_INPUT_COPY[lang].stop : VOICE_INPUT_COPY[lang].start

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || !supported}
        aria-label={label}
        aria-pressed={listening}
        title={error || label}
        className={className}
        style={style}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
        </svg>
      </button>
      {error ? <span className="sr-only" role="status">{error}</span> : null}
    </>
  )
}
