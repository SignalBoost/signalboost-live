import {
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../../../browser-runtime/execution-state.ts'

/**
 * Process-local execution authority for sandbox Browser Runtime continuations.
 * Durable history must never be substituted for these live retained stores.
 */
export const liveSandboxExecutionStore = new InMemoryBrowserExecutionStore()
export const liveSandboxSessionRegistry = new InMemoryBrowserSessionRegistry()
