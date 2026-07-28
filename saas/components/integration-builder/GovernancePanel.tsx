// saas/components/integration-builder/GovernancePanel.tsx
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import { useState } from 'react'
import ToggleSwitch from './ToggleSwitch.tsx'
import Modal from './Modal.tsx'
import { mockApi } from './mockApi.ts'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'

export default function GovernancePanel({ governance, onGovernance }: { governance: { requires_approval: boolean; secrets_backend_only: boolean; supervisor_monitoring: boolean }; onGovernance: (v: typeof governance) => void }) {
  const [logs, setLogs] = useState<string[]>([]); const [status, setStatus] = useState(''); const [open, setOpen] = useState(false)
  async function test() { setStatus('Testing…'); const result = await mockApi.testIntegration(); setLogs(result.logs); setStatus(result.ok ? 'Success: mock integration test passed.' : 'Failed: review generated logs.') }
  return <section className="sb-glass-panel" style={{ padding: 18, display: 'grid', gap: 14 }}><h2 style={{ margin: 0, fontSize: 18 }}><LocalizedText fallback={uiCopy('u_e7f6be05c7898b4e')} /></h2><ToggleSwitch label={uiCopy('u_321cd9ffba092ff8')} help={uiCopy('u_0523f577d900f285')} checked={governance.requires_approval} onChange={(v) => onGovernance({ ...governance, requires_approval: v })} /><ToggleSwitch label={uiCopy('u_6daa9ff32f4cf4aa')} help={uiCopy('u_11e36d3629301e50')} checked={governance.secrets_backend_only} onChange={(v) => onGovernance({ ...governance, secrets_backend_only: v })} /><ToggleSwitch label={uiCopy('u_e43f34ab5575ff5f')} help={uiCopy('u_47d996e8b1bbe11d')} checked={governance.supervisor_monitoring} onChange={(v) => onGovernance({ ...governance, supervisor_monitoring: v })} /><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" onClick={test} style={{ border: 0, borderRadius: 12, background: '#ffc300', color: '#000', padding: '10px 14px', fontWeight: 900 }}><LocalizedText fallback={uiCopy('u_c535f8fc6b1476cb')} /></button><button type="button" onClick={() => setOpen(true)} style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, background: 'rgba(255,255,255,.06)', color: '#fff', padding: '10px 14px', fontWeight: 900 }}><LocalizedText fallback={uiCopy('u_e113dddd5af46358')} /></button></div>{status && <p style={{ margin: 0, color: status.startsWith('Success') ? '#86efac' : '#ffc300' }}>{status}</p>}{logs.slice(0, 2).map((log) => <small key={log} style={{ color: 'rgba(255,255,255,.6)' }}>{log}</small>)}{open && <Modal title={uiCopy('u_f461164df7ed239a')} onClose={() => setOpen(false)}>{(logs.length ? logs : [uiCopy('u_d44a528ff3e48100'), uiCopy('u_2da6f3049d5c359e')]).map((log, i) => <p key={log} style={{ color: 'rgba(255,255,255,.7)' }}>2026-07-16T12:00:0{i}Z · {log}</p>)}</Modal>}</section>
}
