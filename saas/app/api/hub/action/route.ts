// saas/app/api/hub/action/route.ts
// Hub Console Action Route — Server-Side Proxy Engine

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTemplate, validateTemplatePayload } from '@/lib/hub/provider-templates'
import { getCurrentUser as resolveHubUser } from '@/lib/auth/permission-middleware'

type ActionRequest = {
  templateId: string
  payload: Record<string, unknown>
}

// SERVER-SIDE POLICY MAPPING
// Replaces the client-side getHubActionPolicy() call that was crashing the server
const getServerSidePolicy = (actionId: string) => {
  const policies: Record<string, { auditRequired: boolean; approvalRequired: boolean }> = {
    'stripe.view_prices': { auditRequired: false, approvalRequired: false },
    'stripe.view_products': { auditRequired: false, approvalRequired: false },
    'vercel.view_env': { auditRequired: true, approvalRequired: true },
    // Add other action IDs as needed
  }
  return policies[actionId] || { auditRequired: true, approvalRequired: true }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: ActionRequest = await req.json()
    const { templateId, payload } = body
    
    const template = getTemplate(templateId)
    if (!template) return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 })

    const user = await resolveHubUser(req)
    
    // Server-side policy check
    const policy = getServerSidePolicy(template.policyActionId || templateId)
    
    if (policy.approvalRequired && (!user || user.role !== 'owner')) {
      return NextResponse.json({ ok: false, error: 'Owner approval required' }, { status: 403 })
    }

    // Proxy the request
    const serviceKey = String(template.api?.service || '').toLowerCase().trim()
    const result = await streamProxyAction(template, serviceKey, payload)
    
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

async function streamProxyAction(template: any, service: string, payload: Record<string, unknown>) {
  if (service === 'stripe') {
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (template.id === 'stripe.view_prices') {
      const res = await fetch('https://api.stripe.com/v1/prices?limit=100', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      const data = await res.json()
      return { ok: true, data: { prices: data.data || [] } }
    }
  }
  return { ok: false, error: 'Service action not implemented' }
}
