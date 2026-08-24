'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const NEW_CHAT_LABELS = new Set([
  'new chat',
  'nuevo chat',
  'novo chat',
  'nowy czat',
  'новый чат',
])

const SEND_LABELS = new Set([
  'send',
  'enviar',
  'wyślij',
  'отправить',
])

function normalizedButtonLabel(button: HTMLButtonElement): string {
  return String(button.textContent || '')
    .replace(/[＋+]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function assistantComposer(): HTMLTextAreaElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLTextAreaElement>('textarea.sb-input')
}

function collapseComposer(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.scrollTop = 0
}

function clearControlledComposer() {
  const textarea = assistantComposer()
  if (!textarea) return

  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  descriptor?.set?.call(textarea, '')
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  collapseComposer(textarea)
}

function removeStalePromptQuery() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('prompt')) return
  url.searchParams.delete('prompt')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next)
}

function collapseWhenCleared() {
  requestAnimationFrame(() => {
    const textarea = assistantComposer()
    if (textarea && !textarea.value) collapseComposer(textarea)
  })
  window.setTimeout(() => {
    const textarea = assistantComposer()
    if (textarea && !textarea.value) collapseComposer(textarea)
  }, 80)
}

export default function AssistantComposerResetGuard() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== '/dashboard/assistant') return

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('button')
      if (!(button instanceof HTMLButtonElement)) return
      const label = normalizedButtonLabel(button)

      if (NEW_CHAT_LABELS.has(label)) {
        clearControlledComposer()
        removeStalePromptQuery()
        return
      }

      if (SEND_LABELS.has(label)) collapseWhenCleared()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey) return
      const textarea = assistantComposer()
      if (event.target !== textarea) return
      collapseWhenCleared()
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pathname])

  return null
}
