// saas/press-media-core/registry.ts
// Plug-and-play provider registry. A buyer's connected provider = one registered adapter.
// Adding a new provider never touches the engine — you register an adapter, done.
import type { MediaProviderAdapter, ProviderType, ProviderDescriptor } from './types'

export class MediaProviderRegistry {
  private adapters = new Map<string, MediaProviderAdapter>()

  register(adapter: MediaProviderAdapter): this {
    const id = adapter.describe().id
    if (this.adapters.has(id)) throw new Error(`Media provider already registered: ${id}`)
    this.adapters.set(id, adapter)
    return this
  }

  get(id: string): MediaProviderAdapter | undefined { return this.adapters.get(id) }
  has(id: string): boolean { return this.adapters.has(id) }
  ids(): string[] { return [...this.adapters.keys()] }
  list(): ProviderDescriptor[] { return [...this.adapters.values()].map((a) => a.describe()) }
  listByType(type: ProviderType): ProviderDescriptor[] { return this.list().filter((d) => d.type === type) }
}

export function createRegistry(...adapters: MediaProviderAdapter[]): MediaProviderRegistry {
  const registry = new MediaProviderRegistry()
  for (const adapter of adapters) registry.register(adapter)
  return registry
}
