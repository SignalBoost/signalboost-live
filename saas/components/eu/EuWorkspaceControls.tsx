'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Workspace = { id: string; objective: string | null }
type Project = { id: string; name: string | null }
type Config = { url: string; anonKey: string; cookieName: string }

export default function EuWorkspaceControls() {
  const [token, setToken] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [objective, setObjective] = useState('')
  const [projectName, setProjectName] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [filePath, setFilePath] = useState('src/index.ts')
  const [fileContent, setFileContent] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function api(path: string, bearer: string, method = 'GET', body?: unknown) {
    return fetch(path, {
      method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + bearer, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  }

  async function refresh(bearer: string) {
    const [a,b] = await Promise.all([api('/api/eu/workspaces', bearer),api('/api/eu/projects',bearer)])
    if (!a.ok || !b.ok) throw new Error('eu_workspace_unavailable')
    const [workspaceData,projectData] = await Promise.all([a.json(),b.json()])
    setWorkspaces(workspaceData.workspaces ?? [])
    setProjects(projectData.projects ?? [])
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        const configResponse = await fetch('/api/auth/eu/config', { cache: 'no-store' })
        if (!configResponse.ok) return
        const config = await configResponse.json() as Config
        if (config.cookieName !== 'itmounts-eu-auth' || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.url)) return
        const eu = createBrowserClient(config.url, config.anonKey, { cookieOptions: {
          name: config.cookieName, path: '/', sameSite: 'lax', secure: window.location.protocol === 'https:',
        } })
        const { data } = await eu.auth.getSession()
        if (!active || !data.session) return
        setToken(data.session.access_token)
        await refresh(data.session.access_token)
      } catch { if (active) setMessage('Regional Builder workspace unavailable.') }
    }
    void bootstrap()
    return () => { active = false }
  }, [])

  async function mutate(path: string, method: string, body: unknown) {
    if (!token || busy) return
    setBusy(true); setMessage('')
    try {
      const response = await api(path, token, method, body)
      if (!response.ok) throw new Error('regional_write_failed')
      await refresh(token)
      setMessage('Saved in Frankfurt.')
    } catch { setMessage('Frankfurt workspace operation failed; nothing was sent to the US application.') }
    finally { setBusy(false) }
  }

  async function readFile() {
    if (!token || !workspaceId) return
    const response = await api('/api/eu/workspace-files?workspaceId=' + encodeURIComponent(workspaceId), token)
    if (!response.ok) { setMessage('Unable to read regional workspace files.'); return }
    const data = await response.json()
    const file = (data.files as { path: string; content: string }[]).find(item => item.path === filePath)
    setFileContent(file?.content ?? '')
    setMessage(file ? 'Loaded Frankfurt workspace file.' : 'File not found in this workspace.')
  }

  return <section style={{ display: 'grid', gap: 14, maxWidth: 720, width: '100%' }}>
    <h2>Frankfurt Builder workspace</h2>
    <p>Projects and files in this area use Frankfurt tenant-scoped storage. This is not the US Builder dashboard or a connected-provider execution environment.</p>
    <label>Workspace objective <input value={objective} maxLength={500} onChange={event => setObjective(event.target.value)} /></label>
    <button disabled={!token || busy} onClick={() => void mutate('/api/eu/workspaces','POST',{ objective })}>Create workspace</button>
    <label>Workspace
      <select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
        <option value="">Select workspace</option>
        {workspaces.map(item => <option key={item.id} value={item.id}>{item.objective || item.id}</option>)}
      </select>
    </label>
    <label>File path <input value={filePath} maxLength={240} onChange={event => setFilePath(event.target.value)} /></label>
    <label>File content <textarea value={fileContent} rows={9} onChange={event => setFileContent(event.target.value)} /></label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button disabled={!token || !workspaceId || busy} onClick={() => void readFile()}>Load file</button>
      <button disabled={!token || !workspaceId || busy} onClick={() => void mutate('/api/eu/workspace-files','PUT',{ workspaceId, path: filePath, content: fileContent })}>Save file in Frankfurt</button>
    </div>
    <h3>European projects</h3>
    <label>Project name <input value={projectName} maxLength={160} onChange={event => setProjectName(event.target.value)} /></label>
    <button disabled={!token || !projectName.trim() || busy} onClick={() => void mutate('/api/eu/projects','POST',{ name: projectName })}>Create project</button>
    <ul>{projects.map(item => <li key={item.id}>{item.name || item.id}</li>)}</ul>
    {message && <p role="status">{message}</p>}
  </section>
}
