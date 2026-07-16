import type { BrowserProviderAdapter } from './provider-adapter.ts'
import { freezeProvider } from './provider-adapter.ts'
import { BrowserProviderError } from './provider-errors.ts'
import { assertProviderCapabilityRouting } from './provider-routing.ts'

export class ProviderRegistry {
  private readonly byId = new Map<string, BrowserProviderAdapter>()

  register(raw: BrowserProviderAdapter) {
    const provider = freezeProvider(raw)
    assertProviderCapabilityRouting(provider)

    if (this.byId.has(provider.id)) {
      throw new BrowserProviderError('duplicate_provider')
    }

    this.byId.set(provider.id, provider)
    return provider
  }

  remove(id: string) {
    if (!this.byId.delete(id)) throw new BrowserProviderError('unknown_provider')
  }

  lookup(id: string) {
    const provider = this.byId.get(id)
    if (!provider) throw new BrowserProviderError('unknown_provider')
    return provider
  }

  capabilities(id: string) {
    return this.lookup(id).capabilities
  }

  providers() {
    return [...this.byId.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  health(id: string) {
    return this.lookup(id).health
  }

  version(id: string) {
    return this.lookup(id).version
  }

  toJSON() {
    return this.providers()
  }
}
