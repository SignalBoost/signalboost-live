// saas/marketing-sales-core/index.ts
// Public barrel — the single seam a buyer (or a future packages/ extraction)
// imports from. Everything the department exposes is re-exported here; nothing
// app-specific is imported anywhere under marketing-sales-core/.
export * from './types'
export * from './lifecycle'
export * from './i18n'
export { DICTIONARIES } from './i18n/dictionaries'
export type { MsDict } from './i18n/dictionaries'
export { createMemoryStore } from './store'
export * from './executors/types'
export {
  registerExecutor,
  resolveExecutor,
  listExecutors,
  listPublishable,
} from './executors/registry'
// Side-effect imports register the publishers at module load.
import './executors/youtube'
import './executors/tiktok'
import './executors/linkedin'
