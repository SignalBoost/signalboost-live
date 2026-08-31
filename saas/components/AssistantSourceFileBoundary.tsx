'use client'

import { useEffect, type ReactNode } from 'react'

const SOURCE_FILE = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py)$/i
const SOURCE_ACCEPT = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.py'] as const
const ADMITTED_TEXT_MIME = 'text/plain'
export const MAX_ASSISTANT_OBJECTIVE_CHARS = 8_000 as const

function normalizedFile(file: File): File {
  if (!SOURCE_FILE.test(file.name) || file.type === ADMITTED_TEXT_MIME) return file
  // The existing Assistant file guard already admits text/plain. Preserve the executable source
  // filename while normalizing only the browser-provided MIME so the same size/content checks run.
  return new File([file], file.name, { type: ADMITTED_TEXT_MIME, lastModified: file.lastModified })
}

function normalizedFileList(files: FileList | null): FileList | null {
  if (!files?.length || typeof DataTransfer === 'undefined') return files
  const original = Array.from(files)
  if (!original.some(file => SOURCE_FILE.test(file.name))) return files
  const transfer = new DataTransfer()
  for (const file of original) transfer.items.add(normalizedFile(file))
  return transfer.files
}

function expandAccept(input: HTMLInputElement): void {
  if (input.type !== 'file') return
  const existing = String(input.accept || '').split(',').map(value => value.trim()).filter(Boolean)
  const expanded = [...new Set([...existing, ...SOURCE_ACCEPT])]
  input.accept = expanded.join(',')
}

function boundComposer(textarea: HTMLTextAreaElement): void {
  // Preserve stricter fields such as the 4,000-character correction box. Only previously
  // unbounded or looser Assistant composers are brought to the visible 8,000-character contract.
  if (textarea.maxLength < 0 || textarea.maxLength > MAX_ASSISTANT_OBJECTIVE_CHARS) {
    textarea.maxLength = MAX_ASSISTANT_OBJECTIVE_CHARS
  }
}

/**
 * Assistant ingress normalization. Chrome/Windows commonly reports .js/.ts/.py with an empty or
 * executable-source MIME type, while the older picker admitted only document MIME types. Recognized
 * source files are normalized to the already-admitted text/plain transport before React validation.
 * The same scoped boundary also makes the Assistant's 8,000-character request limit visible at the
 * composer, preventing an oversized visual/COS request from being submitted and rejected later.
 */
export default function AssistantSourceFileBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    const refreshControls = () => {
      document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(expandAccept)
      document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(boundComposer)
    }

    const onChange = (event: Event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') return
      expandAccept(input)
      const normalized = normalizedFileList(input.files)
      if (normalized && normalized !== input.files) input.files = normalized
    }

    const onDrop = (event: DragEvent) => {
      const normalized = normalizedFileList(event.dataTransfer?.files || null)
      if (!normalized || normalized === event.dataTransfer?.files || typeof DataTransfer === 'undefined') return
      const transfer = new DataTransfer()
      for (const file of Array.from(normalized)) transfer.items.add(file)
      try {
        Object.defineProperty(event, 'dataTransfer', { configurable: true, value: transfer })
      } catch {
        // The file-picker path remains fully supported when a browser locks DragEvent.dataTransfer.
      }
    }

    refreshControls()
    const observer = new MutationObserver(refreshControls)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    document.addEventListener('change', onChange, true)
    document.addEventListener('drop', onDrop, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('change', onChange, true)
      document.removeEventListener('drop', onDrop, true)
    }
  }, [])

  return children
}
