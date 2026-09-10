'use client'

import { type ReactNode, useEffect, useRef } from 'react'

const OWNED_REPOSITORY = 'https://github.com/signalboost/signalboost-live'
const AUTO_MARKER = '[data-audit-automatic-remediation]'
const HIDDEN_BY_GUARD = 'auditAutoApprovalHidden'
const ORIGINAL_DISPLAY = 'auditAutoApprovalOriginalDisplay'

function normalizedRepository(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}

function repositoryInput(root: HTMLElement): HTMLInputElement | null {
  return Array.from(root.querySelectorAll('input')).find(input => input.type !== 'number') || null
}

function manualApprovalControl(marker: Element): HTMLElement | null {
  const section = marker.closest('section')
  const candidate = section?.firstElementChild
  return candidate instanceof HTMLElement && candidate !== marker ? candidate : null
}

function hideControl(control: HTMLElement) {
  if (control.dataset[HIDDEN_BY_GUARD] === 'true') return
  control.dataset[ORIGINAL_DISPLAY] = control.style.display
  control.dataset[HIDDEN_BY_GUARD] = 'true'
  control.style.display = 'none'
  control.setAttribute('aria-hidden', 'true')
}

function restoreControl(control: HTMLElement) {
  if (control.dataset[HIDDEN_BY_GUARD] !== 'true') return
  control.style.display = control.dataset[ORIGINAL_DISPLAY] || ''
  delete control.dataset[ORIGINAL_DISPLAY]
  delete control.dataset[HIDDEN_BY_GUARD]
  control.removeAttribute('aria-hidden')
}

export default function AuditLayout({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Fail closed while session ownership is being verified. For the canonical
    // repository this prevents a redundant approval button from flashing long
    // enough to be clicked before the durable Self-Healing state is loaded.
    let ownerKnown = false
    let isOwner = false

    const apply = () => {
      const input = repositoryInput(root)
      const target = normalizedRepository(input?.value || '')
      const canonicalTarget = target === '' || target === OWNED_REPOSITORY
      const suppress = canonicalTarget && (!ownerKnown || isOwner)

      root.querySelectorAll(AUTO_MARKER).forEach(marker => {
        const control = manualApprovalControl(marker)
        if (!control) return
        if (suppress) hideControl(control)
        else restoreControl(control)
      })
    }

    const onInput = () => apply()
    root.addEventListener('input', onInput)

    const observer = new MutationObserver(() => apply())
    observer.observe(root, { childList: true, subtree: true })

    apply()
    fetch('/api/credits', { credentials: 'include', cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        ownerKnown = true
        isOwner = data?.isOwner === true
        apply()
      })
      .catch(() => {
        ownerKnown = true
        isOwner = false
        apply()
      })

    return () => {
      observer.disconnect()
      root.removeEventListener('input', onInput)
      root.querySelectorAll(AUTO_MARKER).forEach(marker => {
        const control = manualApprovalControl(marker)
        if (control) restoreControl(control)
      })
    }
  }, [])

  return <div ref={rootRef} data-audit-owner-approval-guard>{children}</div>
}
