'use client'

import { useRef, useState } from 'react'

type WorkspaceFile = { path: string; content: string }
type BuilderReply = { workspaceId?: string; reply?: string; error?: string; files?: string[]; trace?: Array<{ round: number; toolId: string; ok: boolean; error?: string }> }

const MAX_UPLOAD_BYTES = 512 * 1024
function filename(path: string): string { return path.split('/').pop() || 'download.txt' }

export default function DeveloperPage() {
  const [objective, setObjective] = useState('')
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [reply, setReply] = useState('')
  const [trace, setTrace] = useState<BuilderReply['trace']>([])
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function addFiles(selected: FileList | null) {
    if (!selected) return
    const next: WorkspaceFile[] = []
    for (const file of Array.from(selected).slice(0, 20)) {
      if (file.size > MAX_UPLOAD_BYTES) { setError(\`\${file.name} is larger than 512 KB.\`); continue }
      try { next.push({ path: file.webkitRelativePath || file.name, content: await file.text() }) }
      catch { setError(\`Could not read \${file.name}.\`) }
    }
    setFiles(current => [...current.filter(file => !next.some(item => item.path === file.path)), ...next].slice(0, 20))
    if (fileInput.current) fileInput.current.value = ''
  }

  async function run() {
    const task = objective.trim()
    if (!task || running) return
    setRunning(true); setError(''); setReply(''); setTrace([])
    try {
      const response = await fetch('/api/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: task, workspaceId: workspaceId || undefined, files }),
      })
      const data = await response.json().catch(() => ({})) as BuilderReply
      if (data.workspaceId) setWorkspaceId(data.workspaceId)
      setWorkspaceFiles(data.files || [])
      setTrace(data.trace || [])
      if (!response.ok) { setError(data.error || 'Builder could not complete this request.'); return }
      setReply(data.reply || 'Builder completed without a final report.')
      setFiles([])
    } catch { setError('Could not reach Builder.') }
    finally { setRunning(false) }
  }

  function reset() { setWorkspaceId(''); setFiles([]); setWorkspaceFiles([]); setReply(''); setTrace([]); setError(''); setObjective('') }

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: '32px clamp(18px, 5vw, 72px)', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <p style={{ margin: 0, color: '#67e8f9', fontWeight: 800, fontSize: 12, letterSpacing: '.13em', textTransform: 'uppercase' }}>COS Builder</p>
          <h1 style={{ margin: '8px 0', fontSize: 'clamp(28px, 5vw, 44px)' }}>Developer workspace</h1>
          <p style={{ margin: 0, maxWidth: 700, color: '#94a3b8', lineHeight: 1.55 }}>Give COS a coding task. It can inspect supplied files, edit them, run the workspace, and report what it proved.</p>
        </header>
        <section style={{ border: '1px solid #1e293b', borderRadius: 18, background: '#0f172a', padding: 20, display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 8, fontWeight: 700 }}>
            What should Builder do?
            <textarea value={objective} onChange={event => setObjective(event.target.value)} placeholder="For example: create a small Node script that prints a greeting, run it, and tell me the output." rows={5} maxLength={8000} style={{ resize: 'vertical', borderRadius: 12, border: '1px solid #334155', background: '#020617', color: '#f8fafc', padding: 12, font: 'inherit' }} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input ref={fileInput} type="file" multiple onChange={event => addFiles(event.target.files)} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={running} style={secondaryButton}>Add code files</button>
            <button type="button" onClick={reset} disabled={running} style={secondaryButton}>New workspace</button>
            <button type="button" onClick={run} disabled={!objective.trim() || running} style={{ ...primaryButton, opacity: !objective.trim() || running ? .55 : 1 }}>{running ? 'Builder is working…' : 'Run Builder'}</button>
          </div>
          {files.length ? <div style={fileListStyle}>{files.map(file => <span key={file.path} style={fileChipStyle}>{file.path}<button type="button" aria-label={\`Remove \${file.path}\`} onClick={() => setFiles(current => current.filter(item => item.path !== file.path))} style={removeButton}>×</button></span>)}</div> : null}
          {error ? <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{error}</p> : null}
        </section>
        {reply || trace?.length ? <section style={{ border: '1px solid #1e293b', borderRadius: 18, background: '#0f172a', padding: 20, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Result</h2>
          {reply ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#e2e8f0', font: 'inherit', lineHeight: 1.55 }}>{reply}</pre> : null}
          {workspaceId && workspaceFiles.length ? <div style={{ display: 'grid', gap: 7 }}><strong style={{ fontSize: 13 }}>Workspace files</strong>{workspaceFiles.map(path => <a key={path} href={\`/api/builder/workspaces/\${workspaceId}/files/\${path.split('/').map(encodeURIComponent).join('/')}\`} style={{ color: '#67e8f9' }} download={filename(path)}>{path}</a>)}</div> : null}
          {trace?.length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{trace.map(item => <span key={\`\${item.round}-\${item.toolId}\`} style={{ borderRadius: 99, padding: '5px 9px', fontSize: 12, background: item.ok ? '#064e3b' : '#7f1d1d', color: '#fff' }}>{item.toolId}{item.ok ? ' ✓' : ' failed'}</span>)}</div> : null}
        </section> : null}
      </section>
    </main>
  )
}

const primaryButton = { border: 0, borderRadius: 10, background: '#06b6d4', color: '#082f49', padding: '10px 15px', fontWeight: 800, cursor: 'pointer' } as const
const secondaryButton = { border: '1px solid #334155', borderRadius: 10, background: '#172554', color: '#dbeafe', padding: '10px 15px', fontWeight: 700, cursor: 'pointer' } as const
const fileListStyle = { display: 'flex', flexWrap: 'wrap', gap: 8 } as const
const fileChipStyle = { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #334155', borderRadius: 99, padding: '5px 8px 5px 10px', color: '#cbd5e1', fontSize: 13 } as const
const removeButton = { background: 'transparent', border: 0, color: '#fca5a5', fontSize: 18, lineHeight: 1, cursor: 'pointer' } as const
