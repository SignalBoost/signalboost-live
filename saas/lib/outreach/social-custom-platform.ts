// saas/lib/outreach/social-custom-platform.ts
//
// BRING YOUR OWN PLATFORM.
//
// The eight built-in connectors are conveniences, not the product boundary. There are
// far more social platforms than any vendor can maintain adapters for — Threads,
// Pinterest, Bluesky, Mastodon, Telegram, Discord, Weibo, VK, Douyin, whatever a buyer's
// market actually uses — and a buyer should never be told which ones they are allowed to
// publish to. So a platform is something a buyer DECLARES, not something we ship.
//
// A declaration is data: where to send the user to authorize, where to exchange the
// code, what the publish request looks like, and where the post id and permalink appear
// in the response. Registering one costs no code change and no release.
//
// This is the same doctrine the press portable uses for wire services and the browser
// portable uses for its vendor catalog: the engine names capabilities, the buyer names
// providers. Nothing here is SignalBoost-specific.
//
// WHAT IT DOES NOT CHANGE. A declared platform goes through the identical publish path
// as a built-in: the same "a post is published only when the provider confirms it" rule,
// the same approval gate upstream, the same credential resolver, the same refusal to
// invent a permalink. A buyer can add platforms; they cannot add a way to bypass the
// gate.

import type { SocialPostPayload } from './social-connectors.ts'

/** What a request body looks like, before placeholders are filled. */
export type CustomPlatformBody =
  | { kind: 'json'; template: unknown }
  | { kind: 'form'; template: Record<string, string> }
  | { kind: 'text'; template: string }

export type CustomPlatformConfig = {
  /** Stable id used everywhere the platform is referenced. Lower-case, no spaces. */
  id: string
  label: string

  // ── OAuth ──────────────────────────────────────────────────────────────────
  authUrl: string
  tokenUrl?: string
  scopes: string[]

  // ── Publishing ─────────────────────────────────────────────────────────────
  /**
   * Absolute URL of the publish endpoint. Supports the same placeholders as the body,
   * so a platform that puts the account in the path works without special-casing.
   */
  publishUrl: string
  method?: 'POST' | 'PUT' | 'PATCH'
  /** Extra headers. Authorization: Bearer <token> is added automatically. */
  headers?: Record<string, string>
  body: CustomPlatformBody

  // ── Reading the response ───────────────────────────────────────────────────
  /**
   * Dot-path to the post id in the JSON response, e.g. 'data.id' or 'id'. When the id
   * arrives in a header instead, name the header in `idHeader`.
   */
  idPath?: string
  idHeader?: string
  /**
   * Permalink template, e.g. 'https://example.com/p/{id}'. When a platform returns the
   * URL directly, give its dot-path in `urlPath` instead — that is always preferred,
   * because a returned URL is a fact and a template is a guess.
   */
  urlPath?: string
  permalinkTemplate?: string

  // ── Shape ──────────────────────────────────────────────────────────────────
  /** 'text' (default), 'video' or 'media' — what the platform requires to publish. */
  content?: 'text' | 'video' | 'media'
  /** True when the platform posts on behalf of a page/channel that must be chosen first. */
  needsAccountRef?: boolean
}

export type RegisteredCustomPlatform = CustomPlatformConfig & { readonly declared: true }

const registry = new Map<string, RegisteredCustomPlatform>()

function requireField(config: CustomPlatformConfig, field: keyof CustomPlatformConfig): void {
  const value = config[field]
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    throw new Error(`custom platform "${config?.id || '(no id)'}" is missing required field: ${String(field)}`)
  }
}

/**
 * Declare a platform. Call once at startup, before anything publishes.
 *
 * Validation is strict and throws rather than registering something that will fail at
 * publish time — a misconfigured platform should surface when the host boots, not when
 * an approved post is being sent.
 */
export function registerCustomPlatform(config: CustomPlatformConfig): void {
  if (!config || typeof config !== 'object') throw new Error('custom platform config must be an object')
  requireField(config, 'id')
  requireField(config, 'label')
  requireField(config, 'authUrl')
  requireField(config, 'publishUrl')
  if (!config.body) throw new Error(`custom platform "${config.id}" is missing a body template`)
  if (!Array.isArray(config.scopes)) throw new Error(`custom platform "${config.id}" scopes must be an array`)
  // Without one of these the publish result has no id, and a post with no id cannot be
  // reported as published — which is the rule the whole layer turns on.
  if (!config.idPath && !config.idHeader && !config.urlPath) {
    throw new Error(`custom platform "${config.id}" must declare idPath, idHeader or urlPath so a published post can be confirmed`)
  }
  registry.set(config.id, Object.freeze({ ...config, declared: true as const }))
}

export function unregisterCustomPlatform(id: string): void {
  registry.delete(id)
}

export function listCustomPlatforms(): RegisteredCustomPlatform[] {
  return [...registry.values()]
}

export function getCustomPlatform(id: string): RegisteredCustomPlatform | null {
  return registry.get(id) || null
}

export function isCustomPlatform(id: string): boolean {
  return registry.has(id)
}

// ── Placeholder filling ──────────────────────────────────────────────────────
//
// Deliberately a small fixed vocabulary rather than a template language. A buyer
// declaring a platform should not have to learn a DSL, and a DSL in a config file that
// reaches a network call is a larger attack surface than this problem deserves.

function values(payload: SocialPostPayload): Record<string, string> {
  return {
    text: String(payload.text ?? ''),
    videoUrl: String(payload.videoUrl ?? ''),
    imageUrl: String(payload.imageUrl ?? ''),
    accountRef: String(payload.accountRef ?? ''),
    accountName: String((payload as any).accountName ?? ''),
    title: String((payload as any).title ?? payload.text ?? ''),
  }
}

export function fillPlaceholders(input: string, payload: SocialPostPayload): string {
  const map = values(payload)
  return String(input).replace(/\{(\w+)\}/g, (whole, key) => (key in map ? map[key] : whole))
}

function fillDeep(node: unknown, payload: SocialPostPayload): unknown {
  if (typeof node === 'string') return fillPlaceholders(node, payload)
  if (Array.isArray(node)) return node.map(item => fillDeep(item, payload))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) out[key] = fillDeep(value, payload)
    return out
  }
  return node
}

function readPath(source: unknown, path: string): string {
  let cursor: any = source
  for (const segment of String(path).split('.')) {
    if (cursor === null || cursor === undefined) return ''
    cursor = cursor[segment]
  }
  return cursor === null || cursor === undefined ? '' : String(cursor)
}

// ── Execution ────────────────────────────────────────────────────────────────

export type CustomPublishResult = { id: string; url: string | null }

/**
 * Publish through a declared platform.
 *
 * Throws on anything that is not a confirmed post, so the caller's existing failure
 * handling applies unchanged — a declared platform cannot report a success the built-ins
 * would not.
 */
export async function publishViaCustomPlatform(
  config: RegisteredCustomPlatform,
  payload: SocialPostPayload,
  accessToken: string,
): Promise<CustomPublishResult> {
  const url = fillPlaceholders(config.publishUrl, payload)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...(config.headers || {}),
  }

  let body: string | undefined
  if (config.body.kind === 'json') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    body = JSON.stringify(fillDeep(config.body.template, payload))
  } else if (config.body.kind === 'form') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded'
    const form = new URLSearchParams()
    for (const [key, value] of Object.entries(config.body.template)) form.set(key, fillPlaceholders(value, payload))
    body = form.toString()
  } else {
    headers['Content-Type'] = headers['Content-Type'] || 'text/plain'
    body = fillPlaceholders(config.body.template, payload)
  }

  const response = await fetch(url, { method: config.method || 'POST', headers, body })
  const raw = await response.text()
  let parsed: unknown = null
  try { parsed = JSON.parse(raw) } catch { parsed = null }

  if (!response.ok) {
    const detail = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    throw new Error(`${config.id}_publish_failed_${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const headerId = config.idHeader ? response.headers.get(config.idHeader) || '' : ''
  const bodyId = config.idPath && parsed ? readPath(parsed, config.idPath) : ''
  const directUrl = config.urlPath && parsed ? readPath(parsed, config.urlPath) : ''
  const id = headerId || bodyId || directUrl

  // No id and no URL means the provider did not confirm anything, whatever the status
  // code said. Reporting that as published is the one thing this layer never does.
  if (!id) throw new Error(`${config.id}_publish_unconfirmed: response contained no post id or url`)

  const permalink = directUrl
    || (config.permalinkTemplate ? config.permalinkTemplate.replace(/\{id\}/g, id).replace(/\{accountRef\}/g, String(payload.accountRef ?? '')) : null)

  return { id, url: permalink || null }
}
