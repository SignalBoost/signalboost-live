// saas/components/integration-builder/RequestFormBuilder.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import type { SchemaField } from './mockApi.ts'
import { uiText } from '@/lib/i18n/uiText'

const variables = ['input.customerId', 'input.email', 'context.projectId']
export default function RequestFormBuilder({ fields, values, onChange }: { fields: SchemaField[]; values: Record<string, unknown>; onChange: (values: Record<string, unknown>) => void }) {
  if (!fields.length) return <p style={{ color: 'rgba(255,255,255,.55)', margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_8d2dc873dc32e16a')} /></p>
  return <div style={{ display: 'grid', gap: 12 }}>{fields.map((field) => <label key={field.key} style={{ display: 'grid', gap: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}>{field.label}{field.required ? ' *' : ''}
    {field.type === 'toggle' ? <button type="button" onClick={() => onChange({ ...values, [field.key]: !values[field.key] })} style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: values[field.key] ? 'rgba(26,240,255,.12)' : 'rgba(2,6,23,.78)', color: '#fff', padding: 10 }}>{values[field.key] ? uiText('generatedUi.u_92c1cdfdf4cb9cf6') : uiText('generatedUi.u_75081b593d15cf6e')}</button> :
    <select value={String(values[field.key] || '')} onChange={(e) => onChange({ ...values, [field.key]: e.target.value })} style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: '#020617', color: '#fff', padding: 11 }}><option value="">{uiText('generatedUi.u_c7f937836f5d82d5')}{field.type === 'variable' ? uiText('generatedUi.u_817f22c431062702') : uiText('generatedUi.u_398df63bc9a52830')}</option>{(field.type === 'variable' ? variables.map((v) => ({ id: v, label: v })) : field.options || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}
  </label>)}</div>
}
