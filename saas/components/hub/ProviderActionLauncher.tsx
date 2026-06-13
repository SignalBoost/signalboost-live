'use client'

// saas/components/hub/ProviderActionLauncher.tsx
// Hub Console — Simple button + modal launcher for provider actions.
//
// Drop this component into an existing provider card. It handles:
// - Showing a "View Actions" button
// - Opening the action modal on click
// - Closing the modal
// - Success/error handling
//
// Integrates cleanly with the existing ProviderExpansionPage without
// needing to refactor it.

import { useState } from 'react'
import ProviderActionModal from './ProviderActionModal'
import { Lang } from './shared'

export type ProviderActionLauncherProps = {
  providerId: string
  lang: Lang
  label?: string
  variant?: 'primary' | 'secondary'
  onSuccess?: () => void
}

export default function ProviderActionLauncher({
  providerId,
  lang,
  label = 'View Actions',
  variant = 'secondary',
  onSuccess,
}: ProviderActionLauncherProps) {
  const [showModal, setShowModal] = useState(false)

  if (showModal) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', borderRadius: 18, overflow: 'hidden' }}>
          <ProviderActionModal
            providerId={providerId}
            lang={lang}
            onClose={() => setShowModal(false)}
            onSuccess={() => {
              setShowModal(false)
              onSuccess?.()
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setShowModal(true)}
      className="hub-btn"
      style={{
        width: '100%',
        padding: '9px 10px',
        borderRadius: 11,
        border: variant === 'primary' ? '1px solid rgba(26,240,255,.42)' : '1px solid rgba(255,255,255,.13)',
        background: variant === 'primary' ? 'rgba(26,240,255,.12)' : 'rgba(255,255,255,.045)',
        color: variant === 'primary' ? '#1af0ff' : 'rgba(255,255,255,.78)',
        fontSize: 12.5,
        fontWeight: 900,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <span>⚙</span>
      {label}
    </button>
  )
}
