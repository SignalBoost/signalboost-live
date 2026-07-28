// saas/components/hub/GovernedProviderActionFetchBoundary.tsx
'use client'

import { useEffect, type ReactNode } from 'react'

import {
  buildProviderActionClientPlan,
  type ProviderCapabilityResponse,
} from '@/lib/hub/provider-action-client'
import type { ProviderExecutionHandoff } from './ProviderActionExecutionGate.tsx'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const LEGACY_ACTION_ENDPOINTS = new Set([
  '/api/hub/action',
  '/api/hub/action/engine',
  '/api/hub/action/cosa-pr',
  '/api/hub/action/browser-agent/dry-run',
])

function requestPath(input: RequestInfo | URL): string {
  if (typeof input === 'string') return new URL(input, window.location.origin).pathname
  if (input instanceof URL) return input.pathname
  return new URL(input.url, window.location.origin).pathname
}

function capabilitiesFromHandoff(handoff: ProviderExecutionHandoff): ProviderCapabilityResponse {
  const availableModes = Object.freeze(handoff.availableCapabilities.map(capability => capability.mode))
  const browser = handoff.availableCapabilities.find(capability => capability.mode === 'browser_agent')
  const approvedOrigin = String(browser?.approvedOrigin || '').trim()

  return Object.freeze({
    ok: availableModes.length > 0,
    preferredMode: handoff.selectedMode,
    availableModes,
    browserAdapterId: String(browser?.browserAdapterId || '').trim() || null,
    approvedOrigins: Object.freeze(approvedOrigin ? [approvedOrigin] : []),
    reviewedCapabilities: handoff.availableCapabilities,
    review: handoff.review || null,
  })
}

export default function GovernedProviderActionFetchBoundary({
  handoff,
  children,
}: {
  handoff: ProviderExecutionHandoff
  children: ReactNode
}) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    const capabilities = capabilitiesFromHandoff(handoff)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = requestPath(input)
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()

      if (method !== 'POST' || !LEGACY_ACTION_ENDPOINTS.has(path)) {
        return originalFetch(input, init)
      }

      let submitted: { templateId?: unknown; payload?: unknown }
      try {
        submitted = JSON.parse(String(init?.body || '{}')) as { templateId?: unknown; payload?: unknown }
      } catch {
        throw new Error('provider_action_request_invalid')
      }

      const submittedTemplateId = String(submitted.templateId || '').trim()
      if (submittedTemplateId !== handoff.templateId) {
        throw new Error('provider_action_template_mismatch')
      }
      if (!submitted.payload || typeof submitted.payload !== 'object' || Array.isArray(submitted.payload)) {
        throw new Error('provider_payload_required')
      }

      const plan = buildProviderActionClientPlan({
        templateId: handoff.templateId,
        payload: submitted.payload as Record<string, unknown>,
        mode: handoff.selectedMode,
        capabilities,
      })

      if (!plan.endpoint) {
        return new Response(JSON.stringify({
          ok: true,
          mode: plan.mode,
          productLabel: plan.productLabel,
          executesProviderMutation: false,
          message: String(uiCopy('u_3c3093b8e941e4e9')),
          data: plan.body,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (plan.endpoint !== path) {
        throw new Error('provider_action_endpoint_mismatch')
      }

      return originalFetch(plan.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan.body),
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [handoff])

  return children
}
