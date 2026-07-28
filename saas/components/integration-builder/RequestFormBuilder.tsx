// saas/components/integration-builder/RequestFormBuilder.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import type { SchemaField } from './mockApi.ts'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'

const variables = ['input.customerId', 'input.email', 'context.projectId']
export default function RequestFormBuilder({ fields, values, onChange }: { fields: SchemaField[]; values: Record<string, unknown>; onChange: (values: Record<string, unknown>) => void }) {
  if (!fields.length) return <p style={{ color: 'rgba(255,255,255,.55)', margin: 0 }}><LocalizedText fallback={uiCopy('u_2f8a76e1817f7c20')} /></p>
  return <div style={{ display: 'grid', gap: 12 }}>{fields.map((field) => <label key={field.key} style={{ display: 'grid', gap: 6, color: '#fff', fontSize: 13, fontWeight: 800 }}>{field.label}{field.required ? ' *' : ''}
    {field.type === 'toggle' ? <button type="button" onClick={() => onChange({ ...values, [field.key]: !values[field.key] })} style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: values[field.key] ? 'rgba(26,240,255,.12)' : 'rgba(2,6,23,.78)', color: '#fff', padding: 10 }}>{values[field.key] ? uiCopy('u_3291c19e4d4e66c7') : uiCopy('u_4f59079ab8aa0e92')}</button> :
    <select value={String(values[field.key] || '')} onChange={(e) => onChange({ ...values, [field.key]: e.target.value })} style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: '#020617', color: '#fff', padding: 11 }}><option value="">{uiCopy('u_c1a9ded31b85520e')}{field.type === 'variable' ? uiCopy('u_082f918c59c49e36') : uiCopy('u_79e74ed0852112f1')}</option>{(field.type === 'variable' ? variables.map((v) => ({ id: v, label: v })) : field.options || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}
  </label>)}</div>
}
