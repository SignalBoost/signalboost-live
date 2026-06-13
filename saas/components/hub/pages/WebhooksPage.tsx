// saas/components/hub/pages/WebhooksPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { Webhook, WebhookEvent } from '@/lib/hub/webhooks-service'
import { cardStyle, labelStyle } from '../shared'

const AVAILABLE_EVENTS = [
  { id: 'rotation_success', label: 'Key Rotation Success' },
  { id: 'rotation_failed', label: 'Key Rotation Failed' },
  { id: 'key_expiry', label: 'Key Expiring Soon' },
  { id: 'unauthorized_access', label: 'Unauthorized Access' },
  { id: 'key_accessed', label: 'Key Accessed' },
  { id: 'key_exported', label: 'Key Exported' },
]

export function WebhooksPage() {
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
        setError(data.error || 'Failed to load webhooks')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading webhooks')
    } finally {
      setLoading(false)
    }
  }

  async function addWebhook() {
    if (!formUrl.trim() || formEvents.length === 0) {
      setError('URL and at least one event required')
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
        setError(data.error || 'Failed to create webhook')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating webhook')
    }
  }

  async function deleteWebhook(id: string) {
    if (!confirm('Delete this webhook?')) return

    try {
      const res = await fetch(`/api/hub/webhooks?id=${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        fetchWebhooks()
      } else {
        setError(data.error || 'Failed to delete webhook')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting webhook')
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
        alert(`✓ Test successful (${data.statusCode}) - ${data.responseTime}ms`)
      } else {
        setError(`Test failed: ${data.error}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error testing webhook')
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>
          Webhooks
        </h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          Route vault events to external systems via HTTP webhooks
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
          <h3 style={{ ...labelStyle, marginBottom: '1rem' }}>New Webhook</h3>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              Webhook URL
            </label>
            <input
              type="url"
              placeholder="https://example.com/webhooks/vault"
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
              Events to Subscribe
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
                    {event.label}
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
              Create Webhook
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
              Cancel
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
          + Add Webhook
        </button>
      )}

      {/* Webhooks List */}
      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          Loading webhooks...
        </div>
      ) : webhooks.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          No webhooks configured
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
            {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''} • Failures: {webhook.failureCount}
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
              Subscribed Events
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
                    {eventLabel}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                Created
              </div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                {new Date(webhook.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                Last Fired
              </div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                {webhook.lastFiredAt ? new Date(webhook.lastFiredAt).toLocaleString() : 'Never'}
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
              🧪 Test
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
              🗑️ Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
