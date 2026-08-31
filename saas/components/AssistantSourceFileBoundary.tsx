'use client'

import { useEffect, type ReactNode } from 'react'

const SOURCE_FILE = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py)$/i
const SOURCE_ACCEPT = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.py'] as const
const ADMITTED_TEXT_MIME = 'text/plain'

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

/**
 * Chrome/Windows commonly reports .js/.ts/.py with an empty or executable-source MIME type, while
 * the older Assistant picker admitted only document MIME types. Normalize recognized source files
 * to the already-admitted text/plain transport before the existing React file handler runs; the
 * filename, bytes, size limits, and all server validation remain unchanged.
 */
export default function AssistantSourceFileBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    const refreshInputs = () => {
      document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(expandAccept)
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

    refreshInputs()
    const observer = new MutationObserver(refreshInputs)
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
