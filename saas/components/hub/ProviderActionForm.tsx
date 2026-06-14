'use client'

// saas/components/hub/ProviderActionForm.tsx
// Hub Console — Universal form renderer for provider actions.

import { useCallback, useState, type CSSProperties } from 'react'
import {
  getTemplate,
  validateTemplatePayload,
  type ProviderFormField,
} from '@/lib/hub/provider-templates'
import { Lang, cardStyle, bodyStyle, labelStyle, monoStyle } from './shared'

type FormState = 'idle' | 'preview' | 'confirm' | 'submitting' | 'success' | 'error'

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

  const [state, setState] = useState<FormState>('idle')
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {}
    template?.fields.forEach(field => {
      if (field.defaultValue !== undefined) {
        defaults[field.id] = field.defaultValue
      }
    })
    return defaults
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ ok: boolean; message?: string; error?: string; data?: any } | null>(null)

  const validate = useCallback((): boolean => {
    const validation = validateTemplatePayload(templateId, values)

    if (!validation.ok) {
      const nextErrors: Record<string, string> = {}
      validation.missing?.forEach(fieldId => {
        nextErrors[fieldId] = 'This field is required'
      })
      setErrors(nextErrors)
      return false
    }

    setErrors({})
    return true
  }, [templateId, values])

  if (!template) {
    return <div style={{ ...cardStyle, ...bodyStyle }}>Template not found: {templateId}</div>
  }

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
        setResult({ ok: true, message: data.message || 'Action completed successfully.', data: data.data })
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
    <div style={{ ...cardStyle, width: '100%', height: '100%', maxHeight: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 12px', background: 'linear-gradient(135deg, rgba(26,240,255,.10), rgba(3,7,18,.0))', borderBottom: '1px solid rgba(26,240,255,.2)', flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>{template.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{template.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{template.description}</div>
          </div>
        </div>
      </div>

      <div style={{ ...bodyStyle, gap: 16, flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
        {state === 'idle' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
            {template.fields.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,.6)', fontSize: 13 }}>This action requires no additional information.</div>
            ) : (
              template.fields.map(field => <FormField key={field.id} field={field} value={values[field.id]} error={errors[field.id]} onChange={value => handleFieldChange(field.id, value)} lang={lang} />)
            )}
          </div>
        )}

        {state === 'preview' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden' }}>
            <div style={noticeStyle}>Review the action that will be sent to {template.api.service}. Once confirmed, this cannot be undone.</div>
            <div style={jsonBoxStyle}>{JSON.stringify({ template: templateId, api: `${template.api.method} ${template.api.endpoint}`, payload: values }, null, 2)}</div>
          </div>
        )}

        {state === 'confirm' && (
          <CenteredState icon="⚠️" title="Confirm action">You are about to execute <strong>{template.label}</strong> on {template.api.service}.</CenteredState>
        )}

        {state === 'submitting' && <CenteredState icon="⏳" title="Executing action…" spin />}

        {state === 'success' && result?.ok && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{result.message}</div>
            </div>
            <ResultView data={result.data} />
          </div>
        )}

        {state === 'error' && result?.error && (
          <CenteredState icon="❌" title="Error" titleColor="#ef4444"><span style={{ fontFamily: monoStyle.fontFamily }}>{result.error}</span></CenteredState>
        )}
      </div>

      <div style={footerStyle}>
        {state === 'idle' && (
          <>
            {onClose && <button onClick={onClose} className="hub-chip" style={secondaryButtonStyle}>Cancel</button>}
            <button onClick={handleSubmit} className="hub-btn" style={primaryButtonStyle}>{template.previewBeforeSubmit ? 'Preview' : template.requiresConfirm ? 'Confirm' : 'Execute'}</button>
          </>
        )}
        {state === 'preview' && (
          <>
            <button onClick={() => setState('idle')} className="hub-chip" style={secondaryButtonStyle}>Back</button>
            <button onClick={() => (template.requiresConfirm ? setState('confirm') : executeAction())} className="hub-btn" style={warningButtonStyle}>{template.requiresConfirm ? 'Confirm' : 'Execute'}</button>
          </>
        )}
        {state === 'confirm' && (
          <>
            <button onClick={() => setState(template.previewBeforeSubmit ? 'preview' : 'idle')} className="hub-chip" style={secondaryButtonStyle}>Cancel</button>
            <button onClick={executeAction} className="hub-btn" style={dangerButtonStyle}>Execute Now</button>
          </>
        )}
        {(state === 'submitting' || state === 'success' || state === 'error') && onClose && <button onClick={onClose} className="hub-btn" style={closeButtonStyle}>Close</button>}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

type FormFieldProps = { field: ProviderFormField; value: unknown; error?: string; onChange: (value: unknown) => void; lang: Lang }

function FormField({ field, value, error, onChange }: FormFieldProps) {
  const baseStyle: CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: error ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.04)', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }

  const renderInput = () => {
    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        return <input type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'} value={(value as string) || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} maxLength={field.maxLength} style={baseStyle} />
      case 'textarea':
        return <textarea value={(value as string) || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} maxLength={field.maxLength} style={{ ...baseStyle, minHeight: 100, resize: 'vertical' }} />
      case 'number':
      case 'currency_cents':
        return <input type="number" value={(value as number) ?? ''} onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : '')} min={field.min} max={field.max} step={field.type === 'currency_cents' ? 0.01 : 1} placeholder={field.placeholder} style={baseStyle} />
      case 'secret':
        return <input type="password" value={(value as string) || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} maxLength={field.maxLength} style={baseStyle} />
      case 'select':
        return (
          <select value={(value as string) || ''} onChange={e => onChange(e.target.value)} style={{ ...baseStyle, cursor: 'pointer' }}>
            <option value="" disabled style={{ color: '#111', background: '#fff' }}>{field.placeholder || 'Select an option'}</option>
            {field.options?.map(opt => <option key={opt.value} value={opt.value} style={{ color: '#111', background: '#fff' }}>{opt.label}</option>)}
          </select>
        )
      case 'toggle':
        return <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}><input type="checkbox" checked={(value as boolean) || false} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />{field.label}</label>
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      {field.type !== 'toggle' && <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>{field.label}{field.required && <span style={{ color: '#ef4444' }}>*</span>}</label>}
      {renderInput()}
      {field.help && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: -2 }}>{field.help}</div>}
      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: -2 }}>⚠️ {error}</div>}
    </div>
  )
}

function ResultView({ data }: { data: any }) {
  if (data === null || data === undefined) return null
  const arrayKey = data && typeof data === 'object' ? Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0) : null

  if (arrayKey) {
    const rows: any[] = data[arrayKey]
    const first = rows[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) return <ObjectArrayTable rows={rows} />
    return <div style={scrollBoxStyle}>{rows.slice(0, 100).map((v: any, i: number) => <div key={i} style={scalarRowStyle}>{formatCell(v)}</div>)}</div>
  }

  if (data && typeof data === 'object' && typeof data.value === 'string') return <div style={{ ...jsonBoxStyle, color: 'rgba(26,240,255,.85)', fontSize: 12 }}>{data.value}</div>

  if (data && typeof data === 'object') {
    const entries = Object.entries(data).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
    if (entries.length > 0) {
      return <div style={scrollBoxStyle}>{entries.map(([k, v]) => <div key={k} style={keyValueRowStyle}><span style={{ color: 'rgba(255,255,255,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span><span style={valueTextStyle} title={formatCell(v)}>{formatCell(v)}</span></div>)}</div>
    }
  }

  return <div style={jsonBoxStyle}>{JSON.stringify(data, null, 2)}</div>
}

function ObjectArrayTable({ rows }: { rows: any[] }) {
  const columns = getDisplayColumns(rows)
  const gridColumns = makeColumns(columns)

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
      <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, padding: '8px 10px', position: 'sticky', top: 0, background: 'rgba(8,11,20,.98)', borderBottom: '1px solid rgba(255,255,255,.08)', zIndex: 1 }}>
          {columns.map(col => <div key={col} style={tableHeadStyle}>{niceLabel(col)}</div>)}
        </div>
        {rows.slice(0, 100).map((row, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.06)', alignItems: 'center' }}>{columns.map(col => <div key={col} title={formatCell(row[col])} style={col === 'name' || col === 'label' ? tableMainCellStyle : tableCellStyle}>{formatCell(row[col])}</div>)}</div>)}
      </div>
    </div>
  )
}

function getDisplayColumns(rows: any[]): string[] {
  const preferred = ['name', 'label', 'id', 'active', 'created', 'createdAt', 'email', 'username', 'status']
  const existing = new Set<string>()
  rows.forEach(row => Object.keys(row || {}).forEach(k => existing.add(k)))
  const preferredExisting = preferred.filter(k => existing.has(k))
  const rest = Array.from(existing).filter(k => !preferred.includes(k)).slice(0, Math.max(0, 5 - preferredExisting.length))
  return [...preferredExisting, ...rest].slice(0, 5)
}

function makeColumns(columns: string[]) {
  if (columns.length <= 1) return 'minmax(0, 1fr)'
  return columns.map((column, index) => {
    if (index === 0) return 'minmax(160px, 1.7fr)'
    if (column === 'active') return '70px'
    if (column.toLowerCase().includes('created')) return '105px'
    return 'minmax(90px, 1fr)'
  }).join(' ')
}

function niceLabel(key: string): string { return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim() }
function formatCell(v: any): string { if (v === null || v === undefined || v === '') return '—'; if (typeof v === 'boolean') return v ? 'yes' : 'no'; if (typeof v === 'object') return JSON.stringify(v); return String(v) }

function CenteredState({ icon, title, titleColor = '#fff', spin = false, children }: { icon: string; title: string; titleColor?: string; spin?: boolean; children?: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 20 }}><div style={{ fontSize: spin ? 18 : 32, animation: spin ? 'spin 2s linear infinite' : undefined }}>{icon}</div><div><div style={{ fontSize: 14, fontWeight: 700, color: titleColor }}>{title}</div>{children && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>{children}</div>}</div></div>
}

const footerStyle: CSSProperties = { padding: '12px 16px', background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', gap: 10, justifyContent: 'flex-end', flex: '0 0 auto' }
const noticeStyle: CSSProperties = { padding: 12, background: 'rgba(26,240,255,.08)', border: '1px solid rgba(26,240,255,.2)', borderRadius: 10, fontSize: 12, color: 'rgba(255,255,255,.7)', flex: '0 0 auto' }
const jsonBoxStyle: CSSProperties = { flex: 1, minHeight: 0, padding: 12, background: 'rgba(3,7,18,.5)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, fontFamily: monoStyle.fontFamily, fontSize: 11, color: 'rgba(255,255,255,.7)', whiteSpace: 'pre-wrap', overflow: 'auto' }
const scrollBoxStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 10 }
const scalarRowStyle: CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.82)', fontFamily: monoStyle.fontFamily, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }
const keyValueRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 12, padding: '5px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,.05)' }
const valueTextStyle: CSSProperties = { color: 'rgba(255,255,255,.85)', fontFamily: monoStyle.fontFamily, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const tableHeadStyle: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const tableCellStyle: CSSProperties = { fontSize: 11, color: 'rgba(26,240,255,.82)', fontFamily: monoStyle.fontFamily, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }
const tableMainCellStyle: CSSProperties = { ...tableCellStyle, color: '#fff', fontWeight: 700, fontFamily: 'inherit' }
const secondaryButtonStyle: CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const primaryButtonStyle: CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.10)', color: '#1af0ff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const warningButtonStyle: CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,195,0,.35)', background: 'rgba(255,195,0,.10)', color: '#ffc300', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const dangerButtonStyle: CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.15)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const closeButtonStyle: CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: 'rgba(148,163,184,.10)', color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
