'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const TEXT_FILE = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt|txt|md|csv|xml|ya?ml)$/i
const MAX_INLINE_CHARS = 120_000
const COPY: Record<string, { copy: string; copied: string; unavailable: string }> = {
  en: { copy: 'Copy file', copied: 'Copied', unavailable: 'Preview unavailable' },
  es: { copy: 'Copiar archivo', copied: 'Copiado', unavailable: 'Vista previa no disponible' },
  pt: { copy: 'Copiar arquivo', copied: 'Copiado', unavailable: 'Prévia indisponível' },
  pl: { copy: 'Kopiuj plik', copied: 'Skopiowano', unavailable: 'Podgląd niedostępny' },
  ru: { copy: 'Копировать файл', copied: 'Скопировано', unavailable: 'Предпросмотр недоступен' },
}

function fileUrl(workspaceId: string, path: string): string {
  return `/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
}

function TextFilePreview({ workspaceId, path }: { workspaceId: string; path: string }) {
  const { lang } = useI18n()
  const labels = COPY[lang] || COPY.en
  const [content, setContent] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch(fileUrl(workspaceId, path), { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('builder_file_preview_failed')
        const text = await response.text()
        setContent(text.slice(0, MAX_INLINE_CHARS))
      })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true)
      })
    return () => controller.abort()
  }, [workspaceId, path])

  if (failed) return <div className="mt-2 text-xs text-white/55">{path}: {labels.unavailable}</div>
  if (content === null) return null
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-cyan-300/20 bg-slate-950/80">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-xs text-cyan-100">
        <span className="min-w-0 truncate font-mono">{path}</span>
        <button
          type="button"
          className="shrink-0 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 hover:bg-cyan-300/20"
          onClick={async () => {
            await navigator.clipboard.writeText(content)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
          }}
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      <pre className="max-h-[34rem] overflow-auto whitespace-pre p-3 text-left font-mono text-xs leading-5 text-slate-100"><code>{content}</code></pre>
    </section>
  )
}

export default function BuilderFilePreviews({ workspaceId, files }: { workspaceId: string; files: string[] }) {
  const textFiles = files.filter(path => TEXT_FILE.test(path)).slice(0, 6)
  if (!textFiles.length) return null
  return <>{textFiles.map(path => <TextFilePreview key={path} workspaceId={workspaceId} path={path} />)}</>
}
