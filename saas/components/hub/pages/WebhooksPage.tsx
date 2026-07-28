// saas/components/hub/pages/WebhooksPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { Webhook, WebhookEvent } from '@/lib/hub/webhooks-service'
import { cardStyle, labelStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const AVAILABLE_EVENTS = [
  { id: 'rotation_success', label: uiCopy('u_ab6ef6247ee673cc') },
  { id: 'rotation_failed', label: uiCopy('u_cda47095521f3860') },
  { id: 'key_expiry', label: uiCopy('u_426c7d9c94edb102') },
  { id: 'unauthorized_access', label: uiCopy('u_b3da4829a0d55aa3') },
  { id: 'key_accessed', label: uiCopy('u_49fc1d2552964e79') },
  { id: 'key_exported', label: uiCopy('u_d0c5aab5253590fb') },
]

export function WebhooksPage() {
  const { dict } = useI18n()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [formUrl, setFormUrl] = useState('')
  const [formEvents, setFormEvents] = useState<string[]>([])
  const [formActive, setFormActive] = useState(true)

  useEffect(() => {
    fetchWebhooks()
  }, [])

  async function fetchWebhooks() {
    try {
      setLoading(true)
      const res = await fetch('/api/hub/webhooks')
      const data = await res.json()

      if (data.ok) {
        setWebhooks(data.webhooks || [])
      } else {
        setError(data.error || t(dict, 'console.webhooks.err.load', uiCopy('u_51153a67be626225')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.webhooks.err.loading', uiCopy('u_8af04c9a79de4422')))
    } finally {
      setLoading(false)
    }
  }

  async function addWebhook() {
    if (!formUrl.trim() || formEvents.length === 0) {
      setError(t(dict, 'console.webhooks.err.required', uiCopy('u_7cbcead115f7fff6')))
      return
    }

    try {
      const res = await fetch('/api/hub/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formUrl,
          events: formEvents,
          active: formActive,
          retryPolicy: {
            maxRetries: 3,
            delayMs: 1000,
          },
        }),
      })

      const data = await res.json()

      if (data.ok) {
        setFormUrl('')
        setFormEvents([])
        setFormActive(true)
        setShowAddForm(false)
        fetchWebhooks()
        setError(null)
      } else {
        setError(data.error || t(dict, 'console.webhooks.err.create', uiCopy('u_de4f20355c36a2c0')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.webhooks.err.creating', uiCopy('u_5c4f3962680ea34a')))
    }
  }

  async function deleteWebhook(id: string) {
    if (!confirm(t(dict, 'console.webhooks.confirmDelete', uiCopy('u_e60d7d2cad7f10a4')))) return

    try {
      const res = await fetch(`/api/hub/webhooks?id=${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        fetchWebhooks()
      } else {
        setError(data.error || t(dict, 'console.webhooks.err.delete', uiCopy('u_3b96f2be45382d26')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.webhooks.err.deleting', uiCopy('u_fa546c34f9ec232d')))
    }
  }

  async function testWebhook(id: string) {
    try {
      const res = await fetch(`/api/hub/webhooks/test?id=${id}`, {
        method: 'POST',
      })

      const data = await res.json()

      if (data.ok) {
        setError(null)
        alert(`✓ ${t(dict, 'console.webhooks.testSuccess', uiCopy('u_f80f04011f7e9d26'))} (${data.statusCode}) - ${data.responseTime}ms`)
      } else {
        setError(`${t(dict, 'console.webhooks.testFailed', uiCopy('u_7d803043cffb8db8'))}: ${data.error}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.webhooks.err.testing', uiCopy('u_8f5a8a46de92cb0a')))
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>
          {t(dict, 'console.webhooks.title', uiCopy('u_4941baafe5037313'))}
        </h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          {t(dict, 'console.webhooks.subtitle', uiCopy('u_70736638c2063965'))}
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#1a0000',
            color: '#ff6b6b',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Add Webhook Form */}
      {showAddForm && (
        <div style={{ ...cardStyle, marginBottom: '2rem' }}>
          <h3 style={{ ...labelStyle, marginBottom: '1rem' }}>{t(dict, 'console.webhooks.newWebhook', uiCopy('u_79217be9f83b086e'))}</h3>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              {t(dict, 'console.webhooks.urlLabel', uiCopy('u_284f5b6249a6b11e'))}
            </label>
            <input
              type="url"
              placeholder={uiCopy('u_78c9cc3570bb3cb9')}
              value={formUrl}
              onChange={e => setFormUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #333',
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>
              {t(dict, 'console.webhooks.eventsLabel', uiCopy('u_18efc6a1e231e8e5'))}
            </label>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {AVAILABLE_EVENTS.map(event => (
                <label
                  key={event.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    padding: '0.5rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formEvents.includes(event.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setFormEvents([...formEvents, event.id])
                      } else {
                        setFormEvents(formEvents.filter(id => id !== event.id))
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
                    {t(dict, 'console.webhooks.event.' + event.id, event.label)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={addWebhook}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#1af0ff',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem',
              }}
            >
              {t(dict, 'console.webhooks.create', uiCopy('u_d3f2592cd1042a48'))}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#333',
                color: '#aaa',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              {t(dict, 'common.cancel', uiCopy('u_98f13d52f362178a'))}
            </button>
          </div>
        </div>
      )}

      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#1af0ff',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginBottom: '1.5rem',
          }}
        >
          {t(dict, 'console.webhooks.add', uiCopy('u_1a31ed4b80dac5c8'))}
        </button>
      )}
{/* Webhooks List */}
      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          {t(dict, 'console.webhooks.loading', uiCopy('u_2d0ac0634164554a'))}
        </div>
      ) : webhooks.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          {t(dict, 'console.webhooks.empty', uiCopy('u_239cd318a646fc30'))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {webhooks.map(webhook => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              expanded={expandedId === webhook.id}
              onToggle={() => setExpandedId(expandedId === webhook.id ? null : webhook.id)}
              onTest={() => testWebhook(webhook.id)}
              onDelete={() => deleteWebhook(webhook.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WebhookCard({
  webhook,
  expanded,
  onToggle,
  onTest,
  onDelete,
}: {
  webhook: Webhook
  expanded: boolean
  onToggle: () => void
  onTest: () => void
  onDelete: () => void
}) {
  const { dict } = useI18n()
  return (
    <div style={cardStyle}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          paddingBottom: expanded ? '1rem' : '0',
          borderBottom: expanded ? '1px solid #333' : 'none',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: webhook.active ? '#22c55e' : '#666',
              }}
            />
            <div style={{ fontSize: '1rem', fontWeight: 'bold', wordBreak: 'break-all' }}>
              {webhook.url}
            </div>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>
            {webhook.events.length} {webhook.events.length === 1 ? t(dict, 'console.webhooks.eventSingular', uiCopy('u_dc7f0dd9cf1c863a')) : t(dict, 'console.webhooks.eventPlural', uiCopy('u_66cac6c1ffaf6c52'))} • {t(dict, 'console.webhooks.failures', uiCopy('u_003fb4485dfefdcf'))} {webhook.failureCount}
          </div>
        </div>
        <div style={{ fontSize: '1.5rem', color: '#666' }}>
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {expanded && (
        <div style={{ paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          {/* Events */}
          <div>
            <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              {t(dict, 'console.webhooks.subscribedEvents', uiCopy('u_89d1096cd4fdae0c'))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {webhook.events.map(event => {
                const eventLabel = AVAILABLE_EVENTS.find(e => e.id === event)?.label || event
                return (
                  <div
                    key={event}
                    style={{
                      padding: '0.25rem 0.75rem',
                      background: '#1a1a2e',
                      borderRadius: '3px',
                      fontSize: '0.8rem',
                      color: '#1af0ff',
                    }}
                  >
                    {t(dict, 'console.webhooks.event.' + event, eventLabel)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                {t(dict, 'console.webhooks.created', uiCopy('u_92f36a112b0b2891'))}
              </div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                {new Date(webhook.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                {t(dict, 'console.webhooks.lastFired', uiCopy('u_915c96beb227ceff'))}
              </div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                {webhook.lastFiredAt ? new Date(webhook.lastFiredAt).toLocaleString() : t(dict, 'console.webhooks.never', uiCopy('u_274155e9e20a5bfe'))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem' }}>
            <button
              onClick={onTest}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem',
              }}
            >
              🧪 {t(dict, 'console.webhooks.test', uiCopy('u_8db0a6cef5a28a5e'))}
            </button>
            <button
              onClick={onDelete}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem',
              }}
            >
              🗑️ {t(dict, 'console.webhooks.delete', uiCopy('u_b8b24d917dcc5f1b'))}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
