'use client'

// saas/components/hub/ProviderActionModal.tsx
// Hub Console — Modal overlay for executing provider actions.
//
// Shows a list of available actions (from provider-templates.ts) for a selected
// provider, renders the form (ProviderActionForm.tsx) inside the modal, and
// handles success/error/close states.

import { useState } from 'react'
import { getProviderTemplates } from '@/lib/hub/provider-templates'
import { getHubProvider } from '@/lib/hub/provider-registry'
import ProviderActionForm from './ProviderActionForm'
import { Lang, cardStyle, bodyStyle, labelStyle, TONES } from './shared'

export type ProviderActionModalProps = {
  providerId: string
  lang: Lang
  onClose: () => void
  onSuccess?: () => void
}

type ModalState = 'list' | 'form' | 'closed'

export default function ProviderActionModal({ providerId, lang, onClose, onSuccess }: ProviderActionModalProps) {
  const provider = getHubProvider(providerId)
  const templates = getProviderTemplates(providerId)

  const [state, setState] = useState<ModalState>('list')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  if (!provider) {
    return (
      <div style={{ ...cardStyle, ...bodyStyle }}>
        <div style={{ color: 'rgba(255,255,255,.5)' }}>Provider not found: {providerId}</div>
        <button onClick={onClose} style={{ marginTop: 'auto', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Close
        </button>
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div style={{ ...cardStyle, ...bodyStyle }}>
        <div style={{ color: 'rgba(255,255,255,.5)' }}>No actions available for {provider.name}</div>
        <button onClick={onClose} style={{ marginTop: 'auto', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Close
        </button>
      </div>
    )
  }

  // Render the action list or the selected form
  if (state === 'form' && selectedTemplateId) {
    return (
      <ProviderActionForm
        templateId={selectedTemplateId}
        lang={lang}
        onClose={() => {
          setState('list')
          setSelectedTemplateId(null)
        }}
        onSuccess={() => {
          onSuccess?.()
          onClose()
        }}
        onError={error => {
          console.error('Action error:', error)
        }}
      />
    )
  }

  // Action list view
  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', background: 'linear-gradient(135deg, rgba(26,240,255,.10), rgba(3,7,18,.0))', borderBottom: '1px solid rgba(26,240,255,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🎯</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Actions for {provider.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{templates.length} available action{templates.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>

      {/* Body: list of actions */}
      <div style={{ ...bodyStyle, flex: 1, minHeight: 200, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => {
                setSelectedTemplateId(template.id)
                setState('form')
              }}
              style={{
                padding: '12px 14px',
                borderRadius: 11,
                border: '1px solid rgba(26,240,255,.25)',
                background: 'rgba(26,240,255,.08)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget
                el.style.background = 'rgba(26,240,255,.14)'
                el.style.borderColor = 'rgba(26,240,255,.45)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget
                el.style.background = 'rgba(26,240,255,.08)'
                el.style.borderColor = 'rgba(26,240,255,.25)'
              }}
            >
              <span style={{ fontSize: 18 }}>{template.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{template.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{template.description}</div>
              </div>
              <span style={{ color: 'rgba(255,255,255,.5)' }}>→</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer: close button */}
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.15)',
            background: 'rgba(255,255,255,.05)',
            color: 'rgba(255,255,255,.7)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
