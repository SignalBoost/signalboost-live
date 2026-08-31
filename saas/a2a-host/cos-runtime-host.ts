import type { PortableA2AHost } from './portable-a2a-host.ts'

export const COS_A2A_RUNTIME_HOST_VERSION = 'signalboost-cos-a2a-runtime-host-v1' as const

const HOST_KEY = Symbol.for('signalboost.cos.a2a.runtime.host')
type GlobalWithHost = typeof globalThis & { [HOST_KEY]?: PortableA2AHost }

/** Deployment/portable host installation seam. Never stores credentials itself. */
export function installCOSA2ARuntimeHost(host: PortableA2AHost): () => void {
  const target = globalThis as GlobalWithHost
  const previous = target[HOST_KEY]
  target[HOST_KEY] = host
  return () => {
    if (target[HOST_KEY] === host) {
      if (previous) target[HOST_KEY] = previous
      else delete target[HOST_KEY]
    }
  }
}

export function getCOSA2ARuntimeHost(): PortableA2AHost | null {
  return (globalThis as GlobalWithHost)[HOST_KEY] ?? null
}
