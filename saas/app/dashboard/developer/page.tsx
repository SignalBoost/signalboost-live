'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'


type WorkspaceFile = { path: string; content: string }
type BuilderReply = { workspaceId?: string; reply?: string; error?: string; files?: string[]; trace?: Array<{ round: number; toolId: string; ok: boolean; error?: string; path?: string; command?: string; exitCode?: number; stdout?: string; stderr?: string; timedOut?: boolean }> }
type WorkspaceSummary = { id: string; objective: string; updatedAt: string }

const MAX_UPLOAD_BYTES = 512 * 1024
const BUILDER_HANDOFF_FILES_KEY = 'cos-builder-handoff-files-v1'
function filename(path: string): string { return path.split('/').pop() || 'download.txt' }

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<string, Record<Lang, string>> = {
  eyebrow: { en: uiText('generatedUi.u_c3e05e12e11221a9'), es: 'Constructor COS', pt: 'Construtor COS', pl: 'Konstruktor COS', ru: 'Конструктор COS' },
  title: { en: uiText('generatedUi.u_90165eec849454bb'), es: 'Espacio de trabajo para desarrolladores', pt: 'Espaço de trabalho do desenvolvedor', pl: 'Przestrzeń programisty', ru: 'Рабочее пространство разработчика' },
  intro: { en: uiText('generatedUi.u_1397078893f90351'), es: 'Asigna a COS una tarea de programación. Puede inspeccionar archivos, editarlos, ejecutar el espacio de trabajo e informar lo que comprobó.', pt: 'Dê ao COS uma tarefa de programação. Ele pode inspecionar arquivos, editá-los, executar o espaço de trabalho e relatar o que comprovou.', pl: 'Daj COS zadanie programistyczne. Może sprawdzić pliki, je edytować, uruchomić przestrzeń roboczą i przedstawić potwierdzone wyniki.', ru: 'Дайте COS задачу по программированию. Он может изучить файлы, изменить их, запустить рабочее пространство и сообщить подтверждённый результат.' },
  objective: { en: uiText('generatedUi.u_4e3bc4a7c1585908'), es: '¿Qué debe hacer Builder?', pt: 'O que o Builder deve fazer?', pl: 'Co powinien zrobić Builder?', ru: 'Что должен сделать Builder?' },
  placeholder: { en: uiText('generatedUi.u_ef182ac605ddecab'), es: 'Por ejemplo: crea un pequeño script de Node que imprima un saludo, ejecútalo y dime el resultado.', pt: 'Por exemplo: crie um pequeno script Node que imprima uma saudação, execute-o e informe o resultado.', pl: 'Na przykład: utwórz mały skrypt Node, który wypisuje powitanie, uruchom go i podaj wynik.', ru: 'Например: создайте небольшой скрипт Node, который выводит приветствие, запустите его и сообщите результат.' },
  addFiles: { en: uiText('generatedUi.u_ed88dac540d4e632'), es: 'Añadir archivos de código', pt: 'Adicionar arquivos de código', pl: 'Dodaj pliki kodu', ru: 'Добавить файлы кода' },
  newWorkspace: { en: uiText('generatedUi.u_df0caf1b27bd40d1'), es: 'Nuevo espacio de trabajo', pt: 'Novo espaço de trabalho', pl: 'Nowa przestrzeń robocza', ru: 'Новое рабочее пространство' },
  working: { en: uiText('generatedUi.u_4b3a69e725c9b59f'), es: 'Builder está trabajando…', pt: 'O Builder está trabalhando…', pl: 'Builder pracuje…', ru: 'Builder работает…' },
  run: { en: uiText('generatedUi.u_501d4d62d2e80080'), es: 'Ejecutar Builder', pt: 'Executar Builder', pl: 'Uruchom Builder', ru: 'Запустить Builder' },
  saved: { en: uiText('generatedUi.u_c5adc03031df3edf'), es: 'Espacios de trabajo guardados ({count})', pt: 'Espaços de trabalho salvos ({count})', pl: 'Zapisane przestrzenie robocze ({count})', ru: 'Сохранённые рабочие пространства ({count})' },
  workspace: { en: uiText('generatedUi.u_5579543c543087cd'), es: 'Espacio de trabajo {id}', pt: 'Espaço de trabalho {id}', pl: 'Przestrzeń robocza {id}', ru: 'Рабочее пространство {id}' },
  remove: { en: uiText('generatedUi.u_6f0a17de28a43d16'), es: 'Eliminar {path}', pt: 'Remover {path}', pl: 'Usuń {path}', ru: 'Удалить {path}' },
  result: { en: uiText('generatedUi.u_6e7d50e84f4731ef'), es: 'Resultado', pt: 'Resultado', pl: 'Wynik', ru: 'Результат' },
  files: { en: uiText('generatedUi.u_bb2e2d0fd34f9c6d'), es: 'Archivos del espacio de trabajo', pt: 'Arquivos do espaço de trabalho', pl: 'Pliki przestrzeni roboczej', ru: 'Файлы рабочего пространства' },
  evidence: { en: uiText('generatedUi.u_03867aea70acaf4c'), es: 'Evidencia', pt: 'Evidência', pl: 'Dowody', ru: 'Доказательства' },
  noCommand: { en: uiText('generatedUi.u_8d844011c413f415'), es: '(sin comando)', pt: '(sem comando)', pl: '(brak polecenia)', ru: '(нет команды)' },
  exit: { en: uiText('generatedUi.u_e596899f114b5162'), es: 'salida', pt: 'saída', pl: 'wyjście', ru: 'выход' },
  unknown: { en: uiText('generatedUi.u_b23a6a8439c0dde5'), es: 'desconocido', pt: 'desconhecido', pl: 'nieznany', ru: 'неизвестно' },
  timedOut: { en: uiText('generatedUi.u_3dcd80f1b15f796e'), es: 'se agotó el tiempo', pt: 'tempo esgotado', pl: 'przekroczono czas', ru: 'время истекло' },
  failed: { en: uiText('generatedUi.u_5d28a90f4498a814'), es: 'falló', pt: 'falhou', pl: 'nie powiodło się', ru: 'сбой' },
}

export default function DeveloperPage() {
  const { lang } = useI18n()
  const c = (key: keyof typeof COPY) => COPY[key][lang as Lang] ?? COPY[key].en
  const interpolate = (key: keyof typeof COPY, value: string, token = '{path}') => c(key).replace(token, value)
  const [objective, setObjective] = useState('')
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [reply, setReply] = useState('')
  const [trace, setTrace] = useState<BuilderReply['trace']>([])
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const suggestedObjective = new URLSearchParams(window.location.search).get('objective')?.trim()
    if (suggestedObjective) setObjective(suggestedObjective.slice(0, 8_000))
    try {
      const staged = JSON.parse(sessionStorage.getItem(BUILDER_HANDOFF_FILES_KEY) || '[]')
      if (Array.isArray(staged)) setFiles(staged
        .filter(file => typeof file?.path === 'string' && typeof file?.content === 'string')
        .slice(0, 20))
      sessionStorage.removeItem(BUILDER_HANDOFF_FILES_KEY)
    } catch { sessionStorage.removeItem(BUILDER_HANDOFF_FILES_KEY) }
    void loadWorkspaces()
  }, [])

  async function loadWorkspaces() {
    try {
      const response = await fetch('/api/builder', { cache: 'no-store' })
      const data = await response.json()
      if (response.ok) setWorkspaces(Array.isArray(data.workspaces) ? data.workspaces : [])
    } catch { /* workspace history is optional UI state */ }
  }

  async function openWorkspace(id: string) {
    setError('')
    try {
      const response = await fetch(`/api/builder?workspaceId=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Workspace could not be opened.')
      setWorkspaceId(id); setWorkspaceFiles(Array.isArray(data.files) ? data.files : []); setFiles([]); setReply(''); setTrace([])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Workspace could not be opened.') }
  }

  async function addFiles(selected: FileList | null) {
    if (!selected) return
    const next: WorkspaceFile[] = []
    for (const file of Array.from(selected).slice(0, 20)) {
      if (file.size > MAX_UPLOAD_BYTES) { setError(`${file.name} is larger than 512 KB.`); continue }
      try { next.push({ path: file.webkitRelativePath || file.name, content: await file.text() }) }
      catch { setError(`Could not read ${file.name}.`) }
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
      void loadWorkspaces()
    } catch { setError('Could not reach Builder.') }
    finally { setRunning(false) }
  }

  function reset() { setWorkspaceId(''); setFiles([]); setWorkspaceFiles([]); setReply(''); setTrace([]); setError(''); setObjective('') }

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: '32px clamp(18px, 5vw, 72px)', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <p style={{ margin: 0, color: '#67e8f9', fontWeight: 800, fontSize: 12, letterSpacing: '.13em', textTransform: 'uppercase' }}>{c('eyebrow')}</p>
          <h1 style={{ margin: '8px 0', fontSize: 'clamp(28px, 5vw, 44px)' }}>{c('title')}</h1>
          <p style={{ margin: 0, maxWidth: 700, color: '#94a3b8', lineHeight: 1.55 }}>{c('intro')}</p>
        </header>
        <section style={{ border: '1px solid #1e293b', borderRadius: 18, background: '#0f172a', padding: 20, display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 8, fontWeight: 700 }}>
            {c('objective')}
            <textarea value={objective} onChange={event => setObjective(event.target.value)} placeholder={c('placeholder')} rows={5} maxLength={8000} style={{ resize: 'vertical', borderRadius: 12, border: '1px solid #334155', background: '#020617', color: '#f8fafc', padding: 12, font: 'inherit' }} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input ref={fileInput} type="file" multiple onChange={event => addFiles(event.target.files)} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={running} style={secondaryButton}>{c('addFiles')}</button>
            <button type="button" onClick={reset} disabled={running} style={secondaryButton}>{c('newWorkspace')}</button>
            <button type="button" onClick={run} disabled={!objective.trim() || running} style={{ ...primaryButton, opacity: !objective.trim() || running ? .55 : 1 }}>{running ? c('working') : c('run')}</button>
          </div>
          {workspaces.length ? <details><summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>{c('saved').replace('{count}', String(workspaces.length))}</summary><div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{workspaces.map(workspace => <button type="button" key={workspace.id} onClick={() => openWorkspace(workspace.id)} disabled={running} style={{ ...secondaryButton, textAlign: 'left' }}>{workspace.objective || interpolate('workspace', workspace.id.slice(0, 8), '{id}')} <span style={{ color: '#94a3b8' }}>· {new Date(workspace.updatedAt).toLocaleDateString()}</span></button>)}</div></details> : null}
          {files.length ? <div style={fileListStyle}>{files.map(file => <span key={file.path} style={fileChipStyle}>{file.path}<button type="button" aria-label={interpolate('remove', file.path)} onClick={() => setFiles(current => current.filter(item => item.path !== file.path))} style={removeButton}>×</button></span>)}</div> : null}
          {error ? <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{error}</p> : null}
        </section>
        {reply || trace?.length ? <section style={{ border: '1px solid #1e293b', borderRadius: 18, background: '#0f172a', padding: 20, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{c('result')}</h2>
          {reply ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#e2e8f0', font: 'inherit', lineHeight: 1.55 }}>{reply}</pre> : null}
          {workspaceId && workspaceFiles.length ? <div style={{ display: 'grid', gap: 7 }}><strong style={{ fontSize: 13 }}>{c('files')}</strong>{workspaceFiles.map(path => <a key={path} href={`/api/builder/workspaces/${workspaceId}/files/${path.split('/').map(encodeURIComponent).join('/')}`} style={{ color: '#67e8f9' }} download={filename(path)}>{path}</a>)}</div> : null}
          {trace?.length ? <div style={{ display: 'grid', gap: 8 }}><strong style={{ fontSize: 13 }}>{c('evidence')}</strong>{trace.map(item => item.toolId === 'run' ? <pre key={`${item.round}-${item.toolId}`} style={runEvidenceStyle}>$ {item.command || c('noCommand')}{`\n${c('exit')} ${item.exitCode ?? c('unknown')}${item.timedOut ? ` · ${c('timedOut')}` : ''}`}{item.stdout ? `\n${item.stdout}` : ''}{item.stderr ? `\n${item.stderr}` : ''}{item.error ? `\n${item.error}` : ''}</pre> : <span key={`${item.round}-${item.toolId}`} style={{ borderRadius: 99, padding: '5px 9px', fontSize: 12, background: item.ok ? '#064e3b' : '#7f1d1d', color: '#fff', width: 'fit-content' }}>{item.toolId}{item.path ? ` · ${item.path}` : ''}{item.ok ? ' ✓' : ` ${c('failed')}`}{item.error ? ` · ${item.error}` : ''}</span>)}</div> : null}
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
const runEvidenceStyle = { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid #334155', borderRadius: 10, background: '#020617', color: '#cbd5e1', padding: 10, fontSize: 12, lineHeight: 1.5 } as const
