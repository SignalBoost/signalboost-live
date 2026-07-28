'use client'
import { uiText } from '@/lib/i18n/uiText'

export type SuggestionCard = {
  id: string
  title: string
  description: string
  metadata?: string[]
}

type Props = {
  label: string
  suggestions: SuggestionCard[]
  selectedId: string
  onSelect: (id: string) => void
  onRefresh?: () => void
  refreshing?: boolean
}

export function SuggestionCardGrid({ label, suggestions, selectedId, onSelect, onRefresh, refreshing }: Props) {
  return <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <legend style={{ color: '#fff', fontWeight: 850, fontSize: 13 }}>{label}</legend>
      {onRefresh && <button type="button" disabled={refreshing} onClick={onRefresh} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, background: 'rgba(255,255,255,.05)', color: '#fff', padding: '7px 10px', cursor: refreshing ? 'wait' : 'pointer', fontSize: 12 }}>{refreshing ? uiText('generatedUi.u_d20a4476a0a85978') : uiText('generatedUi.u_bf4768405082a5b7')}</button>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {suggestions.map((suggestion) => {
        const active = suggestion.id === selectedId
        return <button
          key={suggestion.id}
          type="button"
          aria-pressed={active}
          onClick={() => onSelect(suggestion.id)}
          style={{ textAlign: 'left', border: active ? '1px solid #ffc300' : '1px solid rgba(255,255,255,.12)', borderRadius: 14, background: active ? 'rgba(255,195,0,.11)' : 'rgba(2,6,23,.58)', color: '#fff', padding: 14, cursor: 'pointer', boxShadow: active ? '0 0 0 2px rgba(255,195,0,.12)' : 'none' }}
        >
          <strong style={{ display: 'block', fontSize: 14 }}>{suggestion.title}</strong>
          <span style={{ display: 'block', color: 'rgba(255,255,255,.65)', fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>{suggestion.description}</span>
          {suggestion.metadata?.length ? <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>{suggestion.metadata.map((item) => <small key={item} style={{ borderRadius: 999, background: 'rgba(26,240,255,.1)', color: '#bffaff', padding: '3px 7px' }}>{item}</small>)}</span> : null}
        </button>
      })}
    </div>
  </fieldset>
}
