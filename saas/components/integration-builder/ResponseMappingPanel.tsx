// saas/components/integration-builder/ResponseMappingPanel.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import { useState } from 'react'
import TreeView from './TreeView.tsx'
import Modal from './Modal.tsx'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'

const outputs = ['integration.output.userId', 'integration.output.email']
export default function ResponseMappingPanel({ schema, mappings, onMappings }: { schema: Record<string, unknown>; mappings: Record<string, string>; onMappings: (v: Record<string, string>) => void }) {
  const [path, setPath] = useState(''); const [output, setOutput] = useState(outputs[0])
  return <section className="sb-glass-panel" style={{ padding: 18, display: 'grid', gap: 14 }}><h2 style={{ margin: 0, fontSize: 18 }}><LocalizedText fallback={uiCopy('u_32df383eedfff57c')} /></h2><TreeView value={schema} onSelect={(p) => { setPath(p); setOutput(outputs[0]) }} /><div style={{ display: 'grid', gap: 8 }}>{Object.entries(mappings).map(([out, source]) => <p key={out} style={{ margin: 0, color: '#bffaff', fontSize: 13 }}>{source} → {out}</p>)}</div>{path && <Modal title={uiCopy('u_ba61d3e9ae964d77')} onClose={() => setPath('')}><p style={{ color: 'rgba(255,255,255,.68)' }}>{uiCopy('u_d00a6744fddff87a')}<strong style={{ color: '#ffc300' }}>{path}</strong>{uiCopy('u_3aa95bc19603bf99')}</p><select value={output} onChange={(e) => setOutput(e.target.value)} style={{ width: '100%', border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: '#020617', color: '#fff', padding: 11 }}>{outputs.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => { onMappings({ ...mappings, [output]: path }); setPath('') }} style={{ marginTop: 12, border: 0, borderRadius: 12, background: '#ffc300', color: '#000', padding: '10px 14px', fontWeight: 900 }}><LocalizedText fallback={uiCopy('u_246be424c994b3cb')} /></button></Modal>}</section>
}
