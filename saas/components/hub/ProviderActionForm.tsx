'use client'

// saas/components/hub/ProviderActionForm.tsx

import { useCallback, useState, type CSSProperties } from 'react'
import {
  getTemplate,
  validateTemplatePayload,
  type ProviderFormField,
} from '@/lib/hub/provider-templates'
import {
  c,
  Lang,
  cardStyle,
  bodyStyle,
  labelStyle,
  monoStyle,
} from './shared'

type FormState =
  | 'idle'
  | 'validating'
  | 'preview'
  | 'confirm'
  | 'submitting'
  | 'success'
  | 'error'

export type ProviderActionFormProps = {
  templateId: string
  lang: Lang
  onSuccess?: () => void
  onError?: (error: string) => void
  onClose?: () => void
}

export default function ProviderActionForm({
  templateId,
  lang,
  onSuccess,
  onError,
  onClose,
}: ProviderActionFormProps) {
  const template = getTemplate(templateId)

  if (!template) {
    return <div style={{ ...cardStyle, ...bodyStyle }}>Template not found: {templateId}</div>
  }

  const [state, setState] = useState<FormState>('idle')
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{
    ok: boolean
    message?: string
    error?: string
    data?: any
  } | null>(null)

  const validate = useCallback((): boolean => {
    const validation = validateTemplatePayload(templateId, values)

    if (!validation.ok) {
      const newErrors: Record<string, string> = {}

      if (validation.missing) {
        validation.missing.forEach(fieldId => {
          newErrors[fieldId] = 'This field is required'
        })
      }

      setErrors(newErrors)
      return false
    }

    setErrors({})
    return true
  }, [templateId, values])

  const handleFieldChange = (fieldId: string, value: unknown) => {
    setValues(prev => ({ ...prev, [fieldId]: value }))

    if (errors[fieldId]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }

  const handleSubmit = async () => {
    if (!validate()) {
      setState('idle')
      return
    }

    if (template.previewBeforeSubmit) {
      setState('preview')
      return
    }

    if (template.requiresConfirm) {
      setState('confirm')
      return
    }

    await executeAction()
  }

  const executeAction = async () => {
    setState('submitting')

    try {
      const res = await fetch('/api/hub/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, payload: values }),
      })

      const data = await res.json()

      if (res.ok) {
        setResult({
          ok: true,
          message: data.message || 'Action completed successfully.',
          data: data.data,
        })

        setState('success')

        if (template.api.method !== 'GET') {
          window.setTimeout(() => onSuccess?.(), 1200)
        }
      } else {
        const error = data.error || 'Action failed.'
        setResult({ ok: false, error })
        setState('error')
        onError?.(error)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      setResult({ ok: false, error: message })
      setState('error')
      onError?.(message)
    }
  }

  return (
    <div
      style={{
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 80px)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px 12px',
          background:
            'linear-gradient(135deg, rgba(26,240,255,.10), rgba(3,7,18,.0))',
          borderBottom: '1px solid rgba(26,240,255,.2)',
          flex: '0 0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>{template.icon}</span>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {template.label}
            </div>

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
              {template.description}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          ...bodyStyle,
          gap: 16,
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {state === 'idle' && (
          <div style={{ overflowY: 'auto', minHeight: 0, paddingRight: 2 }}>
            {template.fields.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: 'rgba(255,255,255,.6)',
                  fontSize: 13,
                }}
              >
                This action requires no additional information.
              </div>
            ) : (
              template.fields.map(field => (
                <FormField
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  error={errors[field.id]}
                  onChange={value => handleFieldChange(field.id, value)}
                  lang={lang}
                />
              ))
            )}
          </div>
        )}

        {state === 'preview' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
            <div
              style={{
                padding: 12,
                background: 'rgba(26,240,255,.08)',
                border: '1px solid rgba(26,240,255,.2)',
                borderRadius: 10,
                fontSize: 12,
                color: 'rgba(255,255,255,.7)',
              }}
            >
              Review the action that will be sent to {template.api.service}. Once confirmed, this cannot be undone.
            </div>

            <div
              style={{
                flex: 1,
                padding: 12,
                background: 'rgba(3,7,18,.5)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 10,
                fontFamily: monoStyle.fontFamily,
                fontSize: 11,
                color: 'rgba(26,240,255,.8)',
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
                minHeight: 0,
              }}
            >
              {JSON.stringify(
                {
                  template: templateId,
                  api: `${template.api.method} ${template.api.endpoint}`,
                  payload: values,
                },
                null,
                2,
              )}
            </div>
          </div>
        )}

        {state === 'confirm' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              padding: 20,
            }}
          >
            <div style={{ fontSize: 32 }}>⚠️</div>

            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                Confirm action
              </div>

              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
                You are about to execute <strong>{template.label}</strong> on {template.api.service}.
              </div>
            </div>
          </div>
        )}

        {state === 'submitting' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              padding: 20,
            }}
          >
            <div style={{ fontSize: 18, animation: 'spin 2s linear infinite' }}>⏳</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Executing action…</div>
          </div>
        )}

        {state === 'success' && result?.ok && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
                {result.message}
              </div>
            </div>

            <ResultView data={result.data} />
          </div>
        )}

        {state === 'error' && result?.error && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              padding: 20,
            }}
          >
            <div style={{ fontSize: 32 }}>❌</div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                Error
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,.6)',
                  marginTop: 4,
                  fontFamily: monoStyle.fontFamily,
                }}
              >
                {result.error}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(255,255,255,.02)',
          borderTop: '1px solid rgba(255,255,255,.07)',
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
          flex: '0 0 auto',
        }}
      >
        {state === 'idle' && (
          <>
            {onClose && (
              <button onClick={onClose} className="hub-chip" style={secondaryButtonStyle}>
                Cancel
              </button>
            )}

            <button onClick={handleSubmit} className="hub-btn" style={primaryButtonStyle}>
              {template.previewBeforeSubmit ? 'Preview' : template.requiresConfirm ? 'Confirm' : 'Execute'}
            </button>
          </>
        )}

        {state === 'preview' && (
          <>
            <button onClick={() => setState('idle')} className="hub-chip" style={secondaryButtonStyle}>
              Back
            </button>

            <button
              onClick={() => (template.requiresConfirm ? setState('confirm') : executeAction())}
              className="hub-btn"
              style={warningButtonStyle}
            >
              {template.requiresConfirm ? 'Confirm' : 'Execute'}
            </button>
          </>
        )}

        {state === 'confirm' && (
          <>
            <button onClick={() => setState('preview')} className="hub-chip" style={secondaryButtonStyle}>
              Cancel
            </button>

            <button onClick={executeAction} className="hub-btn" style={dangerButtonStyle}>
              Execute Now
            </button>
          </>
        )}

        {(state === 'submitting' || state === 'success' || state === 'error') && onClose && (
          <button onClick={onClose} className="hub-btn" style={closeButtonStyle}>
            Close
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

type FormFieldProps = {
  field: ProviderFormField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
  lang: Lang
}

function FormField({ field, value, error, onChange }: FormFieldProps) {
  const baseStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: error ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.04)',
    color: '#fff',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  }

  const renderInput = () => {
    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <input
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
            value={(value as string) || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            style={baseStyle}
          />
        )

      case 'textarea':
        return (
          <textarea
            value={(value as string) || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            style={{ ...baseStyle, minHeight: 100, resize: 'vertical' }}
          />
        )

      case 'number':
      case 'currency_cents':
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')}
            min={field.min}
            max={field.max}
            step={field.type === 'currency_cents' ? 0.01 : 1}
            placeholder={field.placeholder}
            style={baseStyle}
          />
        )

      case 'secret':
        return (
          <input
            type="password"
            value={(value as string) || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            style={baseStyle}
          />
        )

      case 'select':
        return (
          <select
            value={(value as string) || ''}
            onChange={e => onChange(e.target.value)}
            style={{ ...baseStyle, cursor: 'pointer' }}
          >
            <option value="" disabled>
              {field.placeholder || 'Select an option'}
            </option>

            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      case 'toggle':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={(value as boolean) || false}
              onChange={e => onChange(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />

            <label style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
              {field.label}
            </label>
          </div>
        )
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      {field.type !== 'toggle' && (
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          {field.label}
          {field.required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      )}

      {renderInput()}

      {field.help && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: -2 }}>
          {field.help}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: -2 }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}

function ResultView({ data }: { data: any }) {
  if (data === null || data === undefined) return null

  const arrayKey =
    data && typeof data === 'object'
      ? Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0)
      : null

  if (arrayKey) {
    const rows: any[] = data[arrayKey]
    const first = rows[0]

    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: 4,
            paddingBottom: 8,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.slice(0, 100).map((row: any, i: number) => {
              const entries = Object.entries(row).filter(
                ([, v]) => v !== null && v !== undefined && v !== '',
              )

              const title =
                row.name ||
                row.label ||
                row.email ||
                row.username ||
                row.key ||
                row.id ||
                `Item ${i + 1}`

              const rest = entries.filter(
                ([k]) => !['name', 'label', 'email', 'username'].includes(k),
              )

              return (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background:
                      'linear-gradient(160deg, rgba(20,28,46,.6), rgba(8,11,20,.4))',
                    border: '1px solid rgba(255,255,255,.09)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      marginBottom: rest.length ? 7 : 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                      title={formatCell(title)}
                    >
                      {formatCell(title)}
                    </div>

                    <div
                      style={{
                        fontSize: 9.5,
                        color: 'rgba(255,255,255,.35)',
                        fontWeight: 700,
                        flex: '0 0 auto',
                      }}
                    >
                      #{i + 1}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {rest.map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '90px minmax(0, 1fr)',
                          gap: 12,
                          fontSize: 10,
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            color: 'rgba(255,255,255,.4)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {k}
                        </span>

                        <span
                          style={{
                            color: 'rgba(26,240,255,.8)',
                            fontFamily: monoStyle.fontFamily,
                            textAlign: 'right',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                          title={formatCell(v)}
                        >
                          {formatCell(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 10,
          padding: 10,
          minHeight: 0,
        }}
      >
        {rows.slice(0, 100).map((v: any, i: number) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,.82)',
              fontFamily: monoStyle.fontFamily,
              padding: '5px 0',
              borderBottom: '1px solid rgba(255,255,255,.05)',
            }}
          >
            {formatCell(v)}
          </div>
        ))}
      </div>
    )
  }

  if (data && typeof data === 'object' && typeof data.value === 'string') {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 12,
          background: 'rgba(3,7,18,.5)',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 10,
          fontFamily: monoStyle.fontFamily,
          fontSize: 12,
          color: 'rgba(26,240,255,.85)',
          wordBreak: 'break-word',
        }}
      >
        {data.value}
      </div>
    )
  }

  if (data && typeof data === 'object') {
    const entries = Object.entries(data).filter(
      ([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v),
    )

    if (entries.length > 0) {
      return (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 10,
            padding: 10,
          }}
        >
          {entries.map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px minmax(0, 1fr)',
                gap: 12,
                padding: '5px 0',
                fontSize: 12,
                borderBottom: '1px solid rgba(255,255,255,.05)',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,.5)' }}>{k}</span>

              <span
                style={{
                  color: 'rgba(255,255,255,.85)',
                  fontFamily: monoStyle.fontFamily,
                  textAlign: 'right',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={formatCell(v)}
              >
                {formatCell(v)}
              </span>
            </div>
          ))}
        </div>
      )
    }
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: 12,
        background: 'rgba(3,7,18,.5)',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 10,
        fontFamily: monoStyle.fontFamily,
        fontSize: 11,
        color: 'rgba(255,255,255,.7)',
        whiteSpace: 'pre-wrap',
        overflowY: 'auto',
      }}
    >
      {JSON.stringify(data, null, 2)}
    </div>
  )
}

function formatCell(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const secondaryButtonStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.05)',
  color: 'rgba(255,255,255,.7)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(26,240,255,.35)',
  background: 'rgba(26,240,255,.10)',
  color: '#1af0ff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const warningButtonStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,195,0,.35)',
  background: 'rgba(255,195,0,.10)',
  color: '#ffc300',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const dangerButtonStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(239,68,68,.4)',
  background: 'rgba(239,68,68,.15)',
  color: '#ef4444',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const closeButtonStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,.35)',
  background: 'rgba(148,163,184,.10)',
  color: 'rgba(255,255,255,.7)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
