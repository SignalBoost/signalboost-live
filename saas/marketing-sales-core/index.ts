// saas/marketing-sales-core/index.ts
// Public barrel — the single seam a buyer (or a future packages/ extraction)
// imports from. Everything the department exposes is re-exported here; nothing
// app-specific is imported anywhere under marketing-sales-core/.
export * from './types.ts'
export * from './lifecycle.ts'
export * from './i18n.ts'
export { DICTIONARIES } from './i18n/dictionaries.ts'
export type { MsDict } from './i18n/dictionaries.ts'
export { createMemoryStore } from './store.ts'
export * from './executors/types.ts'
export {
  registerExecutor,
  resolveExecutor,
  listExecutors,
  listPublishable,
} from './executors/registry.ts'
// Side-effect imports register the publishers at module load.
import './executors/youtube.ts'
import './executors/tiktok.ts'
import './executors/linkedin.ts'
import './executors/site.ts'
export { publishCampaign } from './publish.ts'
