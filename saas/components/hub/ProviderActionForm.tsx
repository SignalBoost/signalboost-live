'use client'

// saas/components/hub/ProviderActionForm.tsx
// Hub Console — Universal form renderer for provider actions.
//
// Reads a template from provider-templates.ts, renders form fields,
// enforces validation, preview, and confirmation gates, then posts to the
// Hub action route (/api/hub/action). Fully declarative — the template
// governs behavior.

import { useCallback, useState } from 'react'
import { getTemplate, validateTemplatePayload, type ProviderActionTemplate, type ProviderFormField, type FieldType } from '@/lib/hub/provider-templates'
import { c, Lang, cardStyle, bodyStyle, labelStyle, rowStyle, monoStyle, Dot, ActionButton, TONES } from './shared'

type FormState = 'idle' | 'validating' | 'preview' | 'confirm' | 'submitting' | 'success' | 'error'

export type ProviderActionFormProps = {
  templateId: string
  lang: Lang
  onSuccess?: () => void
  onError?: (error: string) => void
  onClose?: () => void
}

export default function ProviderActionForm({ templateId, lang, onSuccess, onError, onClose }: ProviderActionFormProps) {
  const template = getTemplate(templateId)
  if (!template) return <div style={{ ...cardStyle, ...bodyStyle }}>Template not found: {templateId}</div>

  const [state, setState] = useState<FormState>('idle')
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ ok: boolean; message?: string; error?: string; data?: any } | null>(null)

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
    // Clear error for this field on change
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
        body: JSON.stringify({
          templateId,
          payload: values,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, message: data.message || 'Action completed successfully.', data: data.data })
        setState('success')
        // Read-only views shouldn't auto-close — let the operator read the results.
        if (template.api.method !== 'GET') {
          window.setTimeout(() => onSuccess?.(), 1200)
        }
      } else {
        setResult({ ok: false, error: data.error || 'Action failed.' })
        setState('error')
        onError?.(data.error || 'Unknown error')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      setResult({ ok: false, error: message })
      setState('error')
      onError?.(message)
    }
  }

  // Render the form in one of several states: idle, preview, confirm, submitting, success, error
  return (
    <div style={{ ...cardStyle }}>
      {/* Header Band */}
      <div style={{ padding: '14px 16px 12px', background: 'linear-gradient(135deg, rgba(26,240,255,.10), rgba(3,7,18,.0))', borderBottom: '1px solid rgba(26,240,255,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>{template.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{template.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{template.description}</div>
          </div>
        </div>
      </div>

      {/* Body: form fields, preview, confirm, or result */}
      <div style={{ ...bodyStyle, gap: 16, minHeight: 200 }}>
        {state === 'idle' && (
          <>
            {template.fields.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,.6)', fontSize: 13 }}>
                This action requires no additional information.
              </div>
            ) : (
              template.fields.map(field => <FormField key={field.id} field={field} value={values[field.id]} error={errors[field.id]} onChange={value => handleFieldChange(field.id, value)} lang={lang} />)
            )}
          </>
        )}

        {state === 'preview' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 12, background: 'rgba(26,240,255,.08)', border: '1px solid rgba(26,240,255,.2)', borderRadius: 10, fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
              Review the action that will be sent to {template.api.service}. Once confirmed, this cannot be undone.
            </div>
            <div style={{ flex: 1, padding: 12, background: 'rgba(3,7,18,.5)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: 'rgba(26,240,255,.8)', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 300 }}>
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Confirm action</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>You are about to execute <strong>{template.label}</strong> on {template.api.service}.</div>
            </div>
          </div>
        )}

        {state === 'submitting' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 18, animation: 'spin 2s linear infinite' }}>⏳</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Executing action…</div>
          </div>
        )}

        {state === 'success' && result?.ok && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{result.message}</div>
            </div>
            <ResultView data={result.data} />
          </div>
        )}

        {state === 'error' && result?.error && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 32 }}>❌</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>Error</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 4, fontFamily: monoStyle.fontFamily }}>{result.error}</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer: action buttons */}
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        {state === 'idle' && (
          <>
            {onClose && (
              <button onClick={onClose} className="hub-chip" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
            <button onClick={handleSubmit} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.10)', color: '#1af0ff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {template.previewBeforeSubmit ? 'Preview' : template.requiresConfirm ? 'Confirm' : 'Execute'}
            </button>
          </>
        )}
        {state === 'preview' && (
          <>
            <button onClick={() => setState('idle')} className="hub-chip" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Back
            </button>
            <button onClick={() => (template.requiresConfirm ? setState('confirm') : executeAction())} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,195,0,.35)', background: 'rgba(255,195,0,.10)', color: '#ffc300', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {template.requiresConfirm ? 'Confirm' : 'Execute'}
            </button>
          </>
        )}
        {state === 'confirm' && (
          <>
            <button onClick={() => setState('preview')} className="hub-chip" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={executeAction} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.15)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Execute Now
            </button>
          </>
        )}
        {(state === 'submitting' || state === 'success' || state === 'error') && onClose && (
          <button onClick={onClose} className="hub-btn" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: 'rgba(148,163,184,.10)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
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

// ============================================================================
// FormField — renders a single input based on template field type
// ============================================================================

type FormFieldProps = {
  field: ProviderFormField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
  
function FormField({ field, value, error, onChange, lang }: FormFieldProps) {
  const renderInput = () => {
    const baseStyle: React.CSSProperties = {
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
            style={{ ...baseStyle, minHeight: 100, fontFamily: 'inherit', resize: 'vertical' }}
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
          <select value={(value as string) || ''} onChange={e => onChange(e.target.value)} style={{ ...baseStyle, cursor: 'pointer' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {field.type !== 'toggle' && (
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          {field.label}
          {field.required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      )}
      {renderInput()}
      {field.help && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: -2 }}>{field.help}</div>}
      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: -2 }}>⚠️ {error}</div>}
    </div>
  )
}

// Renders the data payload returned by a Hub action. Auto-detects the first
// array in the payload (products, prices, users, keys, env vars, accounts,
// repos, rows, …) and renders it as a readable table; falls back to key/value
// rows for scalar payloads, and to formatted JSON for anything unusual.
function ResultView({ data }: { data: any }) {
  if (data === null || data === undefined) return null

  // SQL editor / generic row arrays
  const arrayKey = data && typeof data === 'object'
    ? Object.keys(data).find(k => Array.isArray((data as any)[k]) && (data as any)[k].length > 0)
    : null

  if (arrayKey) {
    const rows: any[] = (data as any)[arrayKey]
    const first = rows[0]
    // Array of objects -> table
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const colSet = new Set<string>()
      rows.slice(0, 50).forEach((r: any) => {
        Object.keys(r || {}).forEach(k => colSet.add(k))
      })
      const cols: string[] = Array.from(colSet).slice(0, 6)
      return (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {cols.map(col => (
                  <th key={col} style={{ textAlign: 'left', padding: '8px 10px', position: 'sticky', top: 0, background: 'rgba(8,11,20,.96)', color: '#1af0ff', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,.1)', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  {cols.map(col => (
                    <td key={col} style={{ padding: '7px 10px', color: 'rgba(255,255,255,.82)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formatCell(row?.[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    // Array of scalars -> simple list
    return (
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 10 }}>
        {rows.slice(0, 100).map((v: any, i: number) => (
          <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,.82)', fontFamily: 'ui-monospace, monospace', padding: '3px 0' }}>{formatCell(v)}</div>
        ))}
      </div>
    )
  }

  // Reveal-style single value
  if (data && typeof data === 'object' && typeof (data as any).value === 'string') {
    return (
      <div style={{ flex: 1, padding: 12, background: 'rgba(3,7,18,.5)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'rgba(26,240,255,.85)', wordBreak: 'break-all' }}>
        {(data as any).value}
      </div>
    )
  }

  // Scalar key/value object
  if (data && typeof data === 'object') {
    const entries = Object.entries(data).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    if (entries.length > 0) {
      return (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 10 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <span style={{ color: 'rgba(255,255,255,.5)' }}>{k}</span>
              <span style={{ color: 'rgba(255,255,255,.85)', fontFamily: 'ui-monospace, monospace', textAlign: 'right', wordBreak: 'break-all' }}>{formatCell(v)}</span>
            </div>
          ))}
        </div>
      )
    }
  }

  // Fallback: pretty JSON
  return (
    <div style={{ flex: 1, padding: 12, background: 'rgba(3,7,18,.5)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: 'rgba(255,255,255,.7)', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 320 }}>
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

  lang: Lang
}
