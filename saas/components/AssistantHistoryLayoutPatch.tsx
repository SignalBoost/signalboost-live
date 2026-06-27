'use client'

import { useEffect } from 'react'

function patchAssistantHistoryLayout() {
  if (typeof window === 'undefined') return
  if (!window.location.pathname.includes('/dashboard/assistant')) return

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div'))

  for (const el of candidates) {
    const style = el.style
    const looksLikeHistoryDrawer =
      style.position === 'absolute' &&
      style.width.includes('320px') &&
      style.borderRadius === '22px' &&
      style.boxShadow.includes('18px')

    if (!looksLikeHistoryDrawer) continue

    // The old drawer was absolute-positioned over the chat text.
    // Make it a normal flex child so it pushes the conversation aside.
    style.position = 'relative'
    style.top = 'auto'
    style.left = 'auto'
    style.bottom = 'auto'
    style.width = 'clamp(250px, 30vw, 320px)'
    style.flexShrink = '0'
    style.order = '-1'
    style.marginRight = '12px'
    style.height = '100%'

    const parent = el.parentElement
    if (parent) {
      parent.style.display = 'flex'
      parent.style.alignItems = 'stretch'
    }

    // History items were also using single-line ellipsis, making entries hard to read.
    el.querySelectorAll<HTMLElement>('div').forEach((node) => {
      if (node.style.textOverflow === 'ellipsis') {
        node.style.whiteSpace = 'normal'
        node.style.overflow = 'visible'
        node.style.textOverflow = 'clip'
        node.style.overflowWrap = 'anywhere'
        node.style.lineHeight = '1.35'
      }
    })
  }
}

export default function AssistantHistoryLayoutPatch() {
  useEffect(() => {
    patchAssistantHistoryLayout()

    const observer = new MutationObserver(() => patchAssistantHistoryLayout())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })

    window.addEventListener('resize', patchAssistantHistoryLayout)
    window.addEventListener('popstate', patchAssistantHistoryLayout)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', patchAssistantHistoryLayout)
      window.removeEventListener('popstate', patchAssistantHistoryLayout)
    }
  }, [])

  return null
}
