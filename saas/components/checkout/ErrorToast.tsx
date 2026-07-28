'use client'

// saas/components/checkout/ErrorToast.tsx
// Dismissible error notification for checkout flows.

import { useEffect, useState } from 'react'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export type ErrorToastProps = {
  message: string
  isVisible: boolean
  onDismiss: () => void
  autoCloseDuration?: number // ms, 0 = no auto-close
}

export default function ErrorToast({
  message,
  isVisible,
  onDismiss,
  autoCloseDuration = 6000,
}: ErrorToastProps) {
  const [show, setShow] = useState(isVisible)

  useEffect(() => {
    setShow(isVisible)
    if (isVisible && autoCloseDuration > 0) {
      const timer = setTimeout(() => {
        setShow(false)
        onDismiss()
      }, autoCloseDuration)
      return () => clearTimeout(timer)
    }
  }, [isVisible, autoCloseDuration, onDismiss])

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        maxWidth: 420,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'rgba(239, 68, 68, 0.95)',
        border: '1px solid rgba(239, 68, 68, 0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        zIndex: 50000,
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <style>{uiCopy('u_f8c16f82521a62dc')}</style>

      <div style={{ color: '#fca5a5', fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
          {message}
        </div>
      </div>

      <button
        onClick={() => {
          setShow(false)
          onDismiss()
        }}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          fontSize: 18,
          padding: '2px 4px',
          flexShrink: 0,
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)')}
      >
        ×
      </button>
    </div>
  )
}
