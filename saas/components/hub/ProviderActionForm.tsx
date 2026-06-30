'use client'

// saas/components/hub/ProviderActionForm.tsx
// Hub Console — Universal form renderer for provider actions with active intercept pickers.

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  getTemplate,
  validateTemplatePayload,
  type ProviderFormField,
} from '@/lib/hub/provider-templates'
import { Lang, cardStyle, bodyStyle, labelStyle, monoStyle } from './shared'
import { useTranslation } from '@/components/i18n/useTranslation'

// Providers migrated to the portable action engine. Their actions + pickers
// target /api/hub/action/engine; everything else stays on the legacy route.
// The engine accepts the same { templateId, payload } body, so only the URL changes.
const ENGINE_PROVIDERS = ['github', 'openai', 'elevenlabs', 'anthropic', 'gemini', 'resend', 'assemblyai', 'supabase_mkt']
function hubActionEndpoint(templateId: string): string {
  const provider = String(templateId || '').split('.')[0]
  return ENGINE_PROVIDERS.includes(provider) ? '/api/hub/action/engine' : '/api/hub/action'
}

type FormState = 'idle' | 'preview' | 'confirm' | 'submitting' | 'success' | 'error'

type StripeProductOption = {
  id: string
  name: string
  active?: boolean
  created?: string
}

type VercelEnvOption = {
  id: string
  key: string
  target?: string | string[]
}

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
  const { t, dict } = useTranslation()
  const template = getTemplate(templateId, dict)

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
      const res = await fetch(hubActionEndpoint(templateId), {
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
        // Keep the result card open after a successful run. It is dismissed only
        // by the user (Close/Cancel) — no timer, and no onSuccess auto-close.
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
        width: '100%',
        height: '100%',
        maxHeight: '85vh',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 18px 14px',
          background: 'linear-gradient(135deg, rgba(26,240,255,.08), rgba(255,195,0,.04) 60%, rgba(3,7,18,0))',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          position: 'relative',
          flex: '0 0 auto',
        }}
      >
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'linear-gradient(90deg, #ffc300, #1af0ff)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, background: 'rgba(26,240,255,.10)', border: '1px solid rgba(26,240,255,.28)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)' }}>{template.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(26,240,255,.75)', marginBottom: 3 }}>
              Provider Action · {String(template.api?.service || '').toUpperCase()}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-.01em', lineHeight: 1.15 }}>{template.label}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{template.description}</div>
          </div>
        </div>
      </div>

      <div style={{ ...bodyStyle, gap: 16, flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {state === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            {template.fields.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,.6)', fontSize: 13 }}>
                {t('console.actionForm.noExtraInfo', 'This action requires no additional information.')}
              </div>
            ) : (
              template.fields.map(field => (
                <FormField
                  key={field.id}
                  templateId={templateId}
                  field={field}
                  value={values[field.id]}
                  allValues={values}
                  error={errors[field.id]}
                  onChange={value => handleFieldChange(field.id, value)}
                  lang={lang}
                />
              ))
            )}

            {/* Embedded Variable Live Checker Track */}
            {templateId === 'vercel.add_env_var' && (
              <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#1af0ff', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  {t('console.actionForm.activeEnvMap', 'Active Environment Variables Map')}
                </div>
                <EmbeddedVercelEnvList />
              </div>
            )}
          </div>
        )}

        {state === 'preview' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden' }}>
            <div style={noticeStyle}>
              {t('console.ui.review_action', 'Review the action that will be sent to')} {template.api.service}. {t('console.ui.cannot_undo', 'Once confirmed, this cannot be undone.')}
            </div>
            <div style={jsonBoxStyle}>
              {JSON.stringify({ template: templateId, api: `${template.api.method} ${template.api.endpoint}`, payload: values }, null, 2)}
            </div>
          </div>
        )}

        {state === 'confirm' && (
          <CenteredState icon="⚠️" title={t('console.cui.confirm_action', 'Confirm action')}>
            {t('console.ui.about_to_execute', 'You are about to execute')} <strong>{template.label}</strong> {t('console.ui.on', 'on')} {template.api.service}.
          </CenteredState>
        )}

        {state === 'submitting' && <CenteredState icon="⏳" title={t('console.cui.executing_action', 'Executing action…')} spin />}

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
          <CenteredState icon="❌" title={t("console.ui.error", "Error")} titleColor="#ef4444">
            <span style={{ fontFamily: monoStyle.fontFamily }}>{result.error}</span>
          </CenteredState>
        )}
      </div>

      <div style={footerStyle}>
        {state === 'idle' && (
          <>
            {onClose && <button onClick={onClose} className="hub-chip" style={secondaryButtonStyle}>{t('console.ui.cancel', 'Cancel')}</button>}
            <button onClick={handleSubmit} className="hub-btn" style={primaryButtonStyle}>
              {templateId === 'openai.codex_open_cloud' || templateId === 'openai.codex_generate_prompt' ? 'Generate Prompt' : template.previewBeforeSubmit ? t('console.ui.preview', 'Preview') : template.requiresConfirm ? t('console.ui.confirm', 'Confirm') : t('console.ui.execute', 'Execute')}
            </button>
          </>
        )}

        {state === 'preview' && (
          <>
            <button onClick={() => setState('idle')} className="hub-chip" style={secondaryButtonStyle}>{t('console.cui.back', 'Back')}</button>
            <button onClick={() => (template.requiresConfirm ? setState('confirm') : executeAction())} className="hub-btn" style={warningButtonStyle}>
              {template.requiresConfirm ? t('console.ui.confirm', 'Confirm') : t('console.ui.execute', 'Execute')}
            </button>
          </>
        )}

        {state === 'confirm' && (
          <>
            <button onClick={() => setState(template.previewBeforeSubmit ? 'preview' : 'idle')} className="hub-chip" style={secondaryButtonStyle}>{t('console.ui.cancel', 'Cancel')}</button>
            <button onClick={executeAction} className="hub-btn" style={dangerButtonStyle}>{t('console.cui.execute_now', 'Execute Now')}</button>
          </>
        )}

        {(state === 'submitting' || state === 'success' || state === 'error') && onClose && (
          <button onClick={onClose} className="hub-btn" style={closeButtonStyle}>{t('console.ui.close', 'Close')}</button>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

type FormFieldProps = {
  templateId: string
  field: ProviderFormField
  value: unknown
  allValues?: Record<string, unknown>
  error?: string
  onChange: (value: unknown) => void
  lang: Lang
}

function FormField({ templateId, field, value, allValues, error, onChange }: FormFieldProps) {
  const { t } = useTranslation()
  const baseStyle: CSSProperties = {
    width: '100%',
    padding: '11px 13px',
    borderRadius: 10,
    border: error ? '1px solid rgba(239,68,68,.55)' : '1px solid rgba(255,255,255,.13)',
    background: 'rgba(3,7,18,.45)',
    color: '#fff',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  }

  const useStripeProductPicker = isStripeProductPickerField(templateId, field.id)
  const useVercelEnvPicker = templateId === 'vercel.delete_env' && field.id === 'id'

  const renderInput = () => {
    if (field.type === 'remote_select' && field.source) {
      return <RemoteSelect field={field} allValues={allValues} value={value} onChange={onChange} error={error} />
    }
    if (useStripeProductPicker) {
      return <StripeProductPicker value={(value as string) || ''} onChange={onChange} error={error} />
    }
    if (useVercelEnvPicker) {
      return <VercelEnvVarPicker value={(value as string) || ''} onChange={onChange} error={error} />
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
            <option value="" disabled style={{ color: '#111', background: '#fff' }}>
              {field.placeholder || 'Select an option'}
            </option>
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value} style={{ color: '#111', background: '#fff' }}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      case 'toggle':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(value as boolean) || false}
              onChange={e => onChange(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            {field.label}
          </label>
        )
      default:
        return null
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      {field.type !== 'toggle' && (
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: 'rgba(255,255,255,.62)' }}>
          <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: 999, background: '#1af0ff', flexShrink: 0 }} />
          {useVercelEnvPicker ? 'Environment Variable Target Key' : useStripeProductPicker ? 'Product' : field.label}
          {field.required && <span style={{ color: '#ffc300' }}>*</span>}
        </label>
      )}

      {renderInput()}

      {useVercelEnvPicker ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: -2 }}>
          {t('console.actionForm.envHelp', 'Select from live environment configurations. The console maps core variable IDs directly.')}
        </div>
      ) : useStripeProductPicker ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: -2 }}>
          {t('console.actionForm.stripeHelp', 'Select from the live Stripe catalog. The console sends the hidden product ID to Stripe.')}
        </div>
      ) : (
        field.help && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: -2 }}>{field.help}</div>
      )}

      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: -2 }}>⚠️ {error}</div>}
    </div>
  )
}

function isStripeProductPickerField(templateId: string, fieldId: string) {
  const normField = fieldId.toLowerCase().replace(/[^a-z0-9]/g, '')
  return (
    (templateId === 'stripe.create_price' && fieldId === 'product') ||
    (templateId === 'stripe.edit_product' && (normField === 'id' || normField === 'productid')) ||
    (templateId === 'stripe.delete_product' && (normField === 'id' || normField === 'productid')) ||
    (templateId === 'stripe.archive_product' && (normField === 'id' || normField === 'productid' || normField === 'product'))
  )
}

function StripeProductPicker({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: unknown) => void
  error?: string
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [products, setProducts] = useState<StripeProductOption[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      setLoading(true)
      setLoadError(null)

      try {
        const res = await fetch('/api/hub/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: 'stripe.view_products', payload: {} }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Unable to load Stripe products')
        }

        // Deep fallback parsing layout captures data fields whether nested under data.products, data.data.products, or raw roots.
        const items = data.data?.products || data.products || (Array.isArray(data.data) ? data.data : [])

        if (!cancelled) {
          setProducts(items)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load Stripe products')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProducts()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div style={{ ...pickerBoxStyle, borderColor: error ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.15)' }}>
        Loading Stripe catalog…
      </div>
    )
  }

  if (loadError) {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="prod_..."
        style={{
          ...pickerInputStyle,
          border: error ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.15)',
        }}
      />
    )
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        ...pickerInputStyle,
        border: error ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.15)',
      }}
    >
      <option value="" disabled style={{ color: '#111', background: '#fff' }}>
        {t('console.actionForm.selectStripeProduct', 'Select a Stripe product')}
      </option>

      {products.map(product => (
        <option key={product.id} value={product.id} style={{ color: '#111', background: '#fff' }}>
          {product.name || product.id} — {product.id}
        </option>
      ))}
    </select>
  )
}

function VercelEnvVarPicker({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: unknown) => void
  error?: string
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [envs, setEnvs] = useState<VercelEnvOption[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadEnvs() {
      setLoading(true)
      setLoadError(null)

      try {
        const res = await fetch('/api/hub/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: 'vercel.view_env', payload: {} }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Unable to fetch project configurations')
        }

        const items = data.data?.vars || data.data?.envs || (Array.isArray(data.data) ? data.data : [])

        if (!cancelled) {
          setEnvs(items)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to query environment fields')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadEnvs()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div style={{ ...pickerBoxStyle, borderColor: error ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.15)' }}>
        Loading active Vercel configurations…
      </div>
    )
  }

  if (loadError) {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t('console.cui.select_key_id', 'Select key ID...')}
        style={{
          ...pickerInputStyle,
          border: error ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.15)',
        }}
      />
    )
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        ...pickerInputStyle,
        border: error ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.15)',
      }}
    >
      <option value="" disabled style={{ color: '#111', background: '#fff' }}>
        {t('console.actionForm.selectEnvToDelete', 'Select an environment variable to delete')}
      </option>

      {envs.map(env => (
        <option key={env.id || env.key} value={env.id} style={{ color: '#111', background: '#fff' }}>
          {env.key} {env.target ? `(${Array.isArray(env.target) ? env.target.join(', ') : env.target})` : ''}
        </option>
      ))}
    </select>
  )
}

function EmbeddedVercelEnvList() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [envs, setEnvs] = useState<VercelEnvOption[]>([])

  useEffect(() => {
    let cancelled = false
    async function fetchEnvs() {
      try {
        const res = await fetch('/api/hub/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: 'vercel.view_env', payload: {} }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to list inventory profiles')
        
        const items = data.data?.vars || data.data?.envs || (Array.isArray(data.data) ? data.data : [])
        if (!cancelled) setEnvs(items)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Inventory lookup failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchEnvs()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '4px 0' }}>{t('console.cui.querying_vars', 'Querying cluster variables ledger...')}</div>
  if (error) return <div style={{ fontSize: 11, color: '#ef4444' }}>⚠️ Inventory Error: {error}</div>
  if (envs.length === 0) return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '4px 0' }}>{t('console.cui.no_config_keys', 'No active configuration keys found.')}</div>

  return (
    <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, background: 'rgba(0,0,0,0.2)', padding: '6px 10px' }}>
      {envs.map(env => (
        <div key={env.id || env.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12.5 }}>
          <span style={{ fontFamily: monoStyle.fontFamily, color: 'rgba(26,240,255,0.9)', fontWeight: 600 }}>{env.key}</span>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase' }}>
            {env.target ? (Array.isArray(env.target) ? env.target.join(', ') : env.target) : 'all'}
          </span>
        </div>
      ))}
    </div>
  )
}

function remoteLoadErrorMessage(action: string): string {
  return action.startsWith('github.')
    ? 'Live GitHub values unavailable — manual fallback enabled.'
    : 'Could not load live options; fallback manual entry is enabled.'
}

function interpolateLabel(tpl: string, item: any): string {
  return String(tpl).replace(/\{(\w+)\}/g, (_m, k) => {
    const v = item?.[k]
    return v === undefined || v === null ? '' : String(v)
  })
}

function RemoteSelect({
  field,
  value,
  onChange,
  error,
  allValues,
}: {
  field: ProviderFormField
  value: unknown
  onChange: (v: unknown) => void
  error?: string
  allValues: Record<string, unknown>
}) {
  const { t } = useTranslation()
  const source = field.source!
  const deps = source.dependsOn || []
  const depValues = deps.map(d => String(allValues?.[d] ?? ''))
  const depsReady = deps.every((_d, i) => depValues[i] !== '')
  const depKey = JSON.stringify(depValues)
  const listId = `remote-${field.id}-${source.action}`.replace(/[^a-zA-Z0-9_-]/g, '-')

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [options, setOptions] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    if (!depsReady) {
      setOptions([])
      return
    }
    let active = true
    setLoading(true)
    setLoadError(null)
    const payload: Record<string, unknown> = {}
    deps.forEach(d => { payload[d] = allValues?.[d] })
    fetch(hubActionEndpoint(source.action), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: source.action, payload }),
    })
      .then(r => r.json())
      .then(res => {
        if (!active) return
        if (!res?.ok) {
          setLoadError(res?.error || remoteLoadErrorMessage(source.action))
          setOptions([])
          return
        }
        const arr = res?.data?.[source.dataPath]
        const list = Array.isArray(arr) ? arr : []
        const opts = list.map((it: any) => ({
          value: String(it?.[source.valueKey] ?? ''),
          label: interpolateLabel(source.labelTemplate, it),
        })).filter(o => o.value)
        setOptions(opts)
        const cur = String(value ?? '')
        const defaultValue = field.defaultValue === undefined ? '' : String(field.defaultValue)
        const hasCurrent = cur ? opts.some(o => o.value === cur) : false
        const hasDefault = defaultValue ? opts.some(o => o.value === defaultValue) : false

        if (!cur && hasDefault) {
          onChange(defaultValue)
        } else if (cur && !hasCurrent && cur === defaultValue) {
          onChange('')
        } else if (deps.length > 0 && cur && !hasCurrent) {
          onChange('')
        }
      })
      .catch(() => {
        if (active) setLoadError(remoteLoadErrorMessage(source.action))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, depsReady, source.action, source.dataPath, source.valueKey, source.labelTemplate])

  const baseStyle: CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: error ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.04)', color: '#fff', fontSize: 13,
    fontFamily: 'inherit', outline: 'none',
  }

  if (!depsReady) return <div style={{ ...baseStyle, color: 'rgba(255,255,255,.45)' }}>{source.emptyHint || 'Select a previous field first'}</div>

  const current = String(value ?? '')
  return (
    <div>
      <input
        list={listId}
        value={current}
        onChange={e => onChange(e.target.value)}
        placeholder={loading ? 'Loading live options…' : loadError ? 'Fallback manual entry' : options.length ? 'Search or select…' : 'No live options found — fallback manual entry'}
        style={baseStyle}
        disabled={loading}
      />
      <datalist id={listId}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </datalist>
      {loadError && <div style={{ fontSize: 11, color: 'rgba(239,68,68,.85)', marginTop: 4 }}>⚠️ {loadError}</div>}
      {!loading && !loadError && options.length > 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 4 }}>Search live provider values; type manually only if the live value is unavailable.</div>}
      {!loading && !loadError && options.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 4 }}>{t('console.cui.nothing_to_select', 'Nothing to select here yet. Fallback manual entry is enabled.')}</div>}
    </div>
  )
}

function ResultView({ data }: { data: any }) {
  if (data && typeof data === 'object' && typeof data.prompt === 'string') {
    return <CodexHandoffResult data={data} />
  }

  if (data === null || data === undefined) return null

  const arrayKey = data && typeof data === 'object'
    ? Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0)
    : null

  if (arrayKey) {
    const rows: any[] = data[arrayKey]
    const first = rows[0]

    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return <ObjectArrayTable rows={rows} />
    }

    return (
      <div style={scrollBoxStyle}>
        {rows.slice(0, 100).map((v: any, i: number) => (
          <div key={i} style={scalarRowStyle}>{formatCell(v)}</div>
        ))}
      </div>
    )
  }

  if (data && typeof data === 'object' && typeof data.value === 'string') {
    return <div style={{ ...jsonBoxStyle, color: 'rgba(26,240,255,.85)', fontSize: 12 }}>{data.value}</div>
  }

  if (data && typeof data === 'object') {
    const entries = Object.entries(data).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))

    if (entries.length > 0) {
      return (
        <div style={scrollBoxStyle}>
          {entries.map(([k, v]) => (
            <div key={k} style={keyValueRowStyle}>
              <span style={{ color: 'rgba(255,255,255,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
              <span style={valueTextStyle} title={formatCell(v)}>{formatCell(v)}</span>
            </div>
          ))}
        </div>
      )
    }
  }

  return <div style={jsonBoxStyle}>{JSON.stringify(data, null, 2)}</div>
}

function CodexHandoffResult({ data }: { data: any }) {
  const [copied, setCopied] = useState(false)
  const prompt = String(data.prompt || '')
  const codexCloudUrl = String(data.codexCloudUrl || data.url || 'https://chatgpt.com/codex/cloud')

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      <div style={noticeStyle}>
        <strong style={{ color: '#ffc300' }}>Handoff-only workflow:</strong> Copy this prompt, open Codex Cloud, and paste it into the Codex task box.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '0 0 auto' }}>
        <button type="button" onClick={copyPrompt} className="hub-btn" style={primaryButtonStyle}>
          {copied ? 'Copied' : 'Copy Prompt'}
        </button>
        <a href={codexCloudUrl} target="_blank" rel="noreferrer" className="hub-chip" style={{ ...secondaryButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Open Codex Cloud
        </a>
      </div>

      {copied && (
        <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 800, flex: '0 0 auto' }}>
          ✅ Copied
        </div>
      )}

      <label style={{ ...labelStyle, fontSize: 10.5, color: 'rgba(255,255,255,.62)' }}>
        Generated Codex prompt
      </label>
      <textarea readOnly value={prompt} style={{ ...jsonBoxStyle, width: '100%', resize: 'vertical', color: 'rgba(255,255,255,.86)', minHeight: 260 }} />

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.52)', flex: '0 0 auto' }}>
        Direct Codex execution: {data.directExecution ? 'yes' : 'no'} — the Hub does not create a Codex Cloud task directly.
      </div>
    </div>
  )
}

function ObjectArrayTable({ rows }: { rows: any[] }) {
  const columns = getDisplayColumns(rows)
  const gridColumns = makeColumns(columns)

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
      <div style={{ height: '100%', overflowY: 'auto', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 8, padding: '8px 10px', position: 'sticky', top: 0, background: 'rgba(8,11,20,.98)', borderBottom: '1px solid rgba(255,255,255,.08)', zIndex: 1 }}>
          {columns.map(col => <div key={col} style={tableHeadStyle}>{niceLabel(col)}</div>)}
        </div>

        {rows.slice(0, 100).map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,.06)', alignItems: 'center' }}>
            {columns.map(col => (
              <div
                key={col}
                title={formatCell(row[col])}
                style={col === 'name' || col === 'label' || col === 'key' ? tableMainCellStyle : tableCellStyle}
              >
                {formatCell(row[col])}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function getDisplayColumns(rows: any[]): string[] {
  const preferred = ['key', 'name', 'label', 'id', 'type', 'target', 'active', 'created', 'createdAt']
  const existing = new Set<string>()

  rows.forEach(row => Object.keys(row || {}).forEach(k => existing.add(k)))

  const preferredExisting = preferred.filter(k => existing.has(k))
  const rest = Array.from(existing).filter(k => !preferred.includes(k)).slice(0, Math.max(0, 5 - preferredExisting.length))

  return [...preferredExisting, ...rest].slice(0, 5)
}

function makeColumns(columns: string[]) {
  if (columns.length <= 1) return 'minmax(0, 1fr)'

  return columns.map((column, index) => {
    if (index === 0) return 'minmax(120px, 1.6fr)'
    if (column === 'active') return '54px'
    if (column.toLowerCase().includes('created')) return '88px'
    if (column.toLowerCase().includes('price')) return 'minmax(74px, 1fr)'
    return 'minmax(70px, 1fr)'
  }).join(' ')
}

function niceLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()
}

function formatCell(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function CenteredState({
  icon,
  title,
  titleColor = '#fff',
  spin = false,
  children,
}: {
  icon: string
  title: string
  titleColor?: string
  spin?: boolean
  children?: React.ReactNode
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 20 }}>
      <div style={{ fontSize: spin ? 18 : 32, animation: spin ? 'spin 2s linear infinite' : undefined }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: titleColor }}>{title}</div>
        {children && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>{children}</div>}
      </div>
    </div>
  )
}

const footerStyle: CSSProperties = {
  padding: '12px 16px',
  background: 'rgba(255,255,255,.02)',
  borderTop: '1px solid rgba(255,255,255,.07)',
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
  flex: '0 0 auto',
}

const noticeStyle: CSSProperties = {
  padding: 12,
  background: 'rgba(26,240,255,.08)',
  border: '1px solid rgba(26,240,255,.2)',
  borderRadius: 10,
  fontSize: 12,
  color: 'rgba(255,255,255,.7)',
  flex: '0 0 auto',
}

const jsonBoxStyle: CSSProperties = {
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
  overflow: 'auto',
}

const scrollBoxStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10,
  padding: 10,
}

const scalarRowStyle: CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,.82)',
  fontFamily: monoStyle.fontFamily,
  padding: '5px 0',
  borderBottom: '1px solid rgba(255,255,255,.05)',
}

const keyValueRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px minmax(0, 1fr)',
  gap: 12,
  padding: '5px 0',
  fontSize: 12,
  borderBottom: '1px solid rgba(255,255,255,.05)',
}

const valueTextStyle: CSSProperties = {
  color: 'rgba(255,255,255,.85)',
  fontFamily: monoStyle.fontFamily,
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const pickerBoxStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.04)',
  color: 'rgba(255,255,255,.65)',
  fontSize: 13,
}

const pickerInputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,.04)',
  color: '#fff',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
}

const tableHeadStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.45)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const tableCellStyle: CSSProperties = {
  fontSize: 11,
  color: 'rgba(26,240,255,.82)',
  fontFamily: monoStyle.fontFamily,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

const tableMainCellStyle: CSSProperties = {
  ...tableCellStyle,
  color: '#fff',
  fontWeight: 700,
  fontFamily: 'inherit',
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
