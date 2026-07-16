import { SandboxExecutionError } from './sandbox-execution-errors.ts'

export interface SandboxOriginPolicy { allowedOrigins: string[] }
const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
const forbiddenSchemes = new Set(['file:', 'data:', 'blob:', 'javascript:', 'chrome:', 'chrome-extension:', 'moz-extension:'])

export function normalizeSandboxOrigin(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new SandboxExecutionError('invalid_sandbox_origin', 'Sandbox origin must be a valid URL origin.') }
  if (forbiddenSchemes.has(url.protocol) || !['http:', 'https:'].includes(url.protocol)) throw new SandboxExecutionError('forbidden_sandbox_scheme', 'Sandbox origin scheme is not allowed.')
  if (url.username || url.password) throw new SandboxExecutionError('sandbox_origin_credentials', 'Sandbox origin must not embed credentials.')
  if (url.search || url.hash) throw new SandboxExecutionError('sandbox_origin_scope', 'Sandbox origin must not include query or fragment.')
  if (url.pathname !== '/' && url.pathname !== '') throw new SandboxExecutionError('sandbox_origin_path', 'Sandbox origin must not include a path.')
  if (!loopback.has(url.hostname)) throw new SandboxExecutionError('sandbox_origin_not_loopback', 'Sandbox origin must be localhost or loopback.')
  if (!url.port) throw new SandboxExecutionError('sandbox_origin_port_required', 'Sandbox origin must use the configured fixed test port.')
  return url.origin
}

export function assertSandboxOriginAllowed(origin: string, policy: SandboxOriginPolicy): string {
  const normalized = normalizeSandboxOrigin(origin)
  const allowed = policy.allowedOrigins.map(normalizeSandboxOrigin)
  if (!allowed.includes(normalized)) throw new SandboxExecutionError('sandbox_origin_not_allowed', 'Sandbox origin is not the exact configured sandbox origin.')
  return normalized
}

export function assertSandboxUrlAllowed(urlValue: string, policy: SandboxOriginPolicy): string {
  let url: URL
  try { url = new URL(urlValue) } catch { throw new SandboxExecutionError('invalid_sandbox_url', 'Sandbox URL must be valid.') }
  if (url.username || url.password) throw new SandboxExecutionError('sandbox_url_credentials', 'Sandbox URL must not embed credentials.')
  if (/[?&](next|redirect|returnUrl|url|origin)=/i.test(url.search)) throw new SandboxExecutionError('sandbox_redirect_trick', 'Sandbox URL must not include redirect/origin query tricks.')
  assertSandboxOriginAllowed(url.origin, policy)
  return url.href
}
