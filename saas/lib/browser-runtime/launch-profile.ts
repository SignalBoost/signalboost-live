// saas/lib/browser-runtime/launch-profile.ts

import type { BrowserSessionLaunchRequest } from './contracts.ts'
import { SANDBOX_ADAPTER_ID } from './adapter-identifiers.ts'

export interface BrowserLaunchProfile {
  id: string
  headless?: boolean
  launchTimeoutMs?: number
  actionTimeoutMs?: number
  executablePath?: string
  launchArgs?: string[]
  viewport?: { width: number; height: number }
}

export interface BrowserLaunchProfileProvider {
  resolve(request: BrowserSessionLaunchRequest): BrowserLaunchProfile
}

export interface SandboxLaunchProfileOptions {
  adapterId?: string
  allowedOrigins?: string[]
  headless?: boolean
  launchTimeoutMs?: number
  actionTimeoutMs?: number
  viewport?: { width: number; height: number }
}

const DEFAULT_SANDBOX_ORIGINS = ['http://127.0.0.1:4173', 'http://localhost:4173']

function normalizeOrigin(value: string): string {
  return new URL(value).origin
}

export class SandboxBrowserLaunchProfileProvider implements BrowserLaunchProfileProvider {
  private readonly adapterId: string
  private readonly allowedOrigins: Set<string>
  private readonly profile: BrowserLaunchProfile

  constructor(options: SandboxLaunchProfileOptions = {}) {
    this.adapterId = options.adapterId ?? SANDBOX_ADAPTER_ID
    this.allowedOrigins = new Set((options.allowedOrigins ?? DEFAULT_SANDBOX_ORIGINS).map(normalizeOrigin))
    this.profile = {
      id: 'sandbox.chromium.v1',
      headless: options.headless ?? true,
      launchTimeoutMs: options.launchTimeoutMs ?? 20_000,
      actionTimeoutMs: options.actionTimeoutMs ?? 10_000,
      launchArgs: ['--disable-extensions', '--disable-sync', '--no-first-run'],
      viewport: options.viewport ?? { width: 1280, height: 800 },
    }
  }

  resolve(request: BrowserSessionLaunchRequest): BrowserLaunchProfile {
    if (request.adapterId !== this.adapterId) {
      throw new Error(`Sandbox profile rejected adapter: ${request.adapterId}`)
    }
    if (request.provider.toLowerCase() !== 'sandbox') {
      throw new Error(`Sandbox profile rejected provider: ${request.provider}`)
    }
    if (request.mode === 'execute_change') {
      throw new Error('Sandbox profile does not allow execute_change tasks')
    }
    if (request.allowedOrigins.length === 0) {
      throw new Error('Sandbox task requires at least one allowed origin')
    }

    for (const candidate of request.allowedOrigins) {
      const origin = normalizeOrigin(candidate)
      if (!this.allowedOrigins.has(origin)) {
        throw new Error(`Sandbox profile rejected origin: ${origin}`)
      }
    }

    return {
      ...this.profile,
      launchArgs: [...(this.profile.launchArgs ?? [])],
      viewport: this.profile.viewport ? { ...this.profile.viewport } : undefined,
    }
  }
}

export function createSandboxBrowserLaunchProfileProvider(
  options: SandboxLaunchProfileOptions = {},
): BrowserLaunchProfileProvider {
  return new SandboxBrowserLaunchProfileProvider(options)
}
