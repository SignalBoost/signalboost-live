import { AsyncLocalStorage } from 'node:async_hooks'

type PublicDeliveryState = { publicOnly: true }

const publicDeliveryScope = new AsyncLocalStorage<PublicDeliveryState>()

export function isPublicDeliveryScope(): boolean {
  return publicDeliveryScope.getStore()?.publicOnly === true
}

export function withPublicDeliveryScope<T>(work: () => T): T {
  return publicDeliveryScope.run({ publicOnly: true }, work)
}
