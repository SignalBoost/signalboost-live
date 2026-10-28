// saas/lib/ai/inferenceTransport.ts
//
// A CONTROLLED PROVIDER TRANSPORT FOR ONE ASYNC SCOPE. Inside `withInferenceTransport`, every model call the
// inference seam makes (local-inference.ts) goes to the given transport instead of the network, in the calling
// async scope only: concurrent requests from users keep the real providers. This is how the verification campaign
// injects provider faults (busy, hang, truncation, malformed output) against the deployed reasoner in isolation
// (lib/builder/campaign/faults.ts). Calls made under a controlled transport never persist provider usage, so the
// production usage records hold only real provider calls.
//
// Not an environment knob: the scope exists only while a caller runs code inside it.

import { AsyncLocalStorage } from 'node:async_hooks'

export type InferenceTransport = (url: string, init: Readonly<{ method: string; headers: Record<string, string>; body: string; signal: AbortSignal }>) => Promise<Response>

const scope = new AsyncLocalStorage<{ transport: InferenceTransport }>()

export function withInferenceTransport<T>(transport: InferenceTransport, fn: () => Promise<T>): Promise<T> {
  return scope.run({ transport }, fn)
}

export function currentInferenceTransport(): InferenceTransport | null {
  return scope.getStore()?.transport ?? null
}
