'use client'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { labIntegrationUiCopy } from '@/lib/i18n/labIntegrationUiCopy'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Workspace = { id: string; objective: string | null }
type Project = { id: string; name: string | null }
type Config = { url: string; anonKey: string; cookieName: string }

export default function EuWorkspaceControls() {
  const { lang } = useTranslation()
  const copy = labIntegrationUiCopy(lang)

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
    <h2>{copy.u_bcd2e5f363ab}</h2>
    <p>{copy.u_aa1a7198e2f6}</p>
    <label>{copy.u_e678be4b6c83} <input value={objective} maxLength={500} onChange={event => setObjective(event.target.value)} /></label>
    <button disabled={!token || busy} onClick={() => void mutate('/api/eu/workspaces','POST',{ objective })}>{copy.u_4b892277843c}</button>
    <label>{copy.u_87bb59ba2f92}
      <select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
        <option value="">{copy.u_d5cd65235324}</option>
        {workspaces.map(item => <option key={item.id} value={item.id}>{item.objective || item.id}</option>)}
      </select>
    </label>
    <label>{copy.u_2fb6d38632ea} <input value={filePath} maxLength={240} onChange={event => setFilePath(event.target.value)} /></label>
    <label>{copy.u_f0ca7ef61aed} <textarea value={fileContent} rows={9} onChange={event => setFileContent(event.target.value)} /></label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button disabled={!token || !workspaceId || busy} onClick={() => void readFile()}>{copy.u_80a09677b0c0}</button>
      <button disabled={!token || !workspaceId || busy} onClick={() => void mutate('/api/eu/workspace-files','PUT',{ workspaceId, path: filePath, content: fileContent })}>{copy.u_95e2914982ad}</button>
    </div>
    <h3>{copy.u_5dad693ebb18}</h3>
    <label>{copy.u_25498193b898} <input value={projectName} maxLength={160} onChange={event => setProjectName(event.target.value)} /></label>
    <button disabled={!token || !projectName.trim() || busy} onClick={() => void mutate('/api/eu/projects','POST',{ name: projectName })}>{copy.u_fa67e4d0dae5}</button>
    <ul>{projects.map(item => <li key={item.id}>{item.name || item.id}</li>)}</ul>
    {message && <p role="status">{message}</p>}
  </section>
}
