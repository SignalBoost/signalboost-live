// saas/lib/hub/webhooks-service.ts
// Webhook management and event routing

import { createClient } from '@supabase/supabase-js'

export interface Webhook {
  id: string
  url: string
  events: string[] // rotation_success, rotation_failed, key_expiry, unauthorized_access
  active: boolean
  secret?: string // For HMAC verification
  headers?: Record<string, string>
  retryPolicy: {
    maxRetries: number
    delayMs: number
  }
  createdAt: string
  updatedAt: string
  lastFiredAt?: string
  failureCount: number
}

export interface WebhookEvent {
  id: string
  webhookId: string
  eventType: string
  payload: Record<string, unknown>
  status: 'pending' | 'sent' | 'failed' | 'retrying'
  statusCode?: number
  error?: string
  firedAt: string
  retryCount: number
}

export interface WebhooksResponse {
  ok: boolean
  webhooks?: Webhook[]
  error?: string
}

export interface WebhookEventResponse {
  ok: boolean
  events?: WebhookEvent[]
  error?: string
}

/**
 * List all webhooks
 */
export async function listWebhooks(): Promise<WebhooksResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_webhooks')
      .select('*')
      .order('createdAt', { ascending: false })

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, webhooks: data || [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Create new webhook
 */
export async function createWebhook(webhook: Omit<Webhook, 'id' | 'createdAt' | 'updatedAt' | 'failureCount'>): Promise<{
  ok: boolean
  webhook?: Webhook
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_webhooks')
      .insert([
        {
          ...webhook,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          failureCount: 0,
        },
      ])
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, webhook: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Update webhook
 */
export async function updateWebhook(id: string, updates: Partial<Webhook>): Promise<{
  ok: boolean
  webhook?: Webhook
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_webhooks')
      .update({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, webhook: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Delete webhook
 */
export async function deleteWebhook(id: string): Promise<{
  ok: boolean
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error } = await supabase
      .from('hub_webhooks')
      .delete()
      .eq('id', id)

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Test webhook by firing a test event
 */
export async function testWebhook(id: string): Promise<{
  ok: boolean
  statusCode?: number
  responseTime?: number
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get webhook details
    const { data: webhook, error: fetchError } = await supabase
      .from('hub_webhooks')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !webhook) {
      return { ok: false, error: 'Webhook not found' }
    }

    // Fire test event
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'Test webhook event',
    }

    const startTime = Date.now()
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...webhook.headers,
        },
        body: JSON.stringify(testPayload),
      })

      const responseTime = Date.now() - startTime

      // Log the test event
      await supabase.from('hub_webhook_events').insert([
        {
          webhookId: id,
          eventType: 'test',
          payload: testPayload,
          status: response.ok ? 'sent' : 'failed',
          statusCode: response.status,
          firedAt: new Date().toISOString(),
          retryCount: 0,
        },
      ])

      return {
        ok: response.ok,
        statusCode: response.status,
        responseTime,
      }
    } catch (err) {
      const responseTime = Date.now() - startTime
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'

      // Log the failed test event
      await supabase.from('hub_webhook_events').insert([
        {
          webhookId: id,
          eventType: 'test',
          payload: testPayload,
          status: 'failed',
          error: errorMsg,
          firedAt: new Date().toISOString(),
          retryCount: 0,
        },
      ])

      return { ok: false, error: errorMsg, responseTime }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Get webhook events/history
 */
export async function getWebhookEvents(webhookId: string, limit: number = 20): Promise<WebhookEventResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_webhook_events')
      .select('*')
      .eq('webhookId', webhookId)
      .order('firedAt', { ascending: false })
      .limit(limit)

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, events: data || [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
