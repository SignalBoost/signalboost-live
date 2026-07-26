// saas/lib/integrations/catalog.ts
// Aggregates every provider catalog (sales + security) and registers them once.
import { registerSalesCatalog, SALES_CATALOG } from './catalog-sales.ts'
import { registerSecurityCatalog, SECURITY_CATALOG } from './catalog-security.ts'

export const CATALOG = [...SALES_CATALOG, ...SECURITY_CATALOG]

let done = false
export function registerCatalog(): void {
  if (done) return
  registerSalesCatalog()
  registerSecurityCatalog()
  done = true
}
registerCatalog()
