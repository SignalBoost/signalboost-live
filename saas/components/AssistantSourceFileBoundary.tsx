'use client'

import { useEffect, type ReactNode } from 'react'

const SOURCE_FILE = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py)$/i
const SOURCE_ACCEPT = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.py'] as const
const SOURCE_MIME: Readonly<Record<string, string>> = Object.freeze({
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  ts: 'text/typescript',
  mts: 'text/typescript',
  cts: 'text/typescript',
  tsx: 'text/typescript',
  jsx: 'text/javascript',
  py: 'text/x-python',
})

function sourceMime(name: string): string {
  const extension = String(name || '').trim().toLowerCase().split('.').pop() || ''
  return SOURCE_MIME[extension] || 'text/plain'
}

function normalizedFile(file: File): File {
  if (!SOURCE_FILE.test(file.name)) return file
  const expected = sourceMime(file.name)
  if (file.type === expected) return file
  return new File([file], file.name, { type: expected, lastModified: file.lastModified })
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
 * the older Assistant picker admitted only document MIME types. Normalize only recognized source
 * extensions before the existing React file handler runs; size limits and all server validation stay
 * unchanged. This boundary also makes the source extensions visible in the native picker.
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
