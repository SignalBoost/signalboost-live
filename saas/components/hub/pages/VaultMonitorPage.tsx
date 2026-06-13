'use client'

// saas/components/hub/pages/VaultMonitorPage.tsx
// Monitor 2 — Key Vault in the horizontal Hub flow.
// The Vault is intentionally tall/vertical and hides the platform mirror.

import { PageProps } from '../shared'
import KeyVaultV2Page from './KeyVaultV2Page'

export default function VaultMonitorPage(props: PageProps) {
  return (
    <div className="hub-vault-monitor" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <style>{`.hub-vault-monitor > .hub-panel{height:100%!important;min-height:0!important;overflow-y:auto!important;padding:4px 12px 24px 4px!important;gap:28px!important;scroll-snap-type:y proximity}.hub-vault-monitor > .hub-panel > section{min-height:72vh;padding:24px 0 18px;scroll-snap-align:start}.hub-vault-monitor > .hub-panel > section:nth-of-type(1){min-height:82vh}.hub-vault-monitor > .hub-panel > section:nth-of-type(2){min-height:54vh}.hub-vault-monitor > .hub-panel > section:nth-of-type(3){display:none!important}.hub-vault-monitor .hub-card{border-radius:22px}.hub-vault-monitor [style*="maxHeight: 240"]{max-height:none!important}@media (max-width:720px){.hub-vault-monitor > .hub-panel{padding-right:4px!important}.hub-vault-monitor > .hub-panel > section{min-height:78vh}}`}</style>
      <KeyVaultV2Page {...props} />
    </div>
  )
}
