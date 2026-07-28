// saas/components/integration-builder/IntegrationMetadataPanel.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import SearchableDropdown from './SearchableDropdown.tsx'
import type { Option, Provider } from './mockApi.ts'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'

export default function IntegrationMetadataPanel({ name, description, tags, providerId, tagOptions, providers, onName, onDescription, onTags, onProvider }: { name: string; description: string; tags: string[]; providerId: string; tagOptions: Option[]; providers: Provider[]; onName: (v: string) => void; onDescription: (v: string) => void; onTags: (v: string[]) => void; onProvider: (v: string) => void }) {
  return <section className="sb-glass-panel" style={{ padding: 18, display: 'grid', gap: 16 }}><h2 style={{ margin: 0, fontSize: 18 }}><LocalizedText fallback={uiCopy('u_82c8c00349a0398b')} /></h2><label style={{ display: 'grid', gap: 7, color: '#fff', fontWeight: 850, fontSize: 13 }}><LocalizedText fallback={uiCopy('u_dca7674c4eb8b109')} /><input type="text" value={name} onChange={(e) => onName(e.target.value)} placeholder={uiCopy('u_9e7ae82373e161a7')} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, background: 'rgba(2,6,23,.78)', color: '#fff', padding: 12 }} /></label><label style={{ display: 'grid', gap: 7, color: '#fff', fontWeight: 850, fontSize: 13 }}>{uiCopy('u_36572718aedeb01a')}<textarea value={description} onChange={(e) => onDescription(e.target.value)} placeholder={uiCopy('u_ae24c7c50a66cc15')} rows={4} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, background: 'rgba(2,6,23,.78)', color: '#fff', padding: 12, resize: 'vertical' }} /></label><SearchableDropdown label={uiCopy('u_8282a2a99fcff7ca')} options={tagOptions} value={tags} onChange={(v) => onTags(v as string[])} multiple placeholder={uiCopy('u_01d546ad1edc343c')} /><SearchableDropdown label={uiCopy('u_2eddb6de83675bff')} options={providers.map((p) => ({ id: p.id, label: p.name, description: p.description, icon: p.icon }))} value={providerId} onChange={(v) => onProvider(v as string)} placeholder={uiCopy('u_b7df2bdc4942d452')} /></section>
}
