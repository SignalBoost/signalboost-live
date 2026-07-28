// saas/components/hub/pages/VaultMonitorPage.tsx
'use client'

// saas/components/hub/pages/VaultMonitorPage.tsx
// Monitor 2 — Key Vault in the horizontal Hub flow.
// The Vault is intentionally tall/vertical and hides the platform mirror.

import { PageProps } from '../shared.tsx'
import KeyVaultV2Page from './KeyVaultV2Page.tsx'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function VaultMonitorPage(props: PageProps) {
  return (
    <div className="hub-vault-monitor" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <style>{uiCopy('u_56ca41de85f93e73')}</style>
      <KeyVaultV2Page {...props} />
    </div>
  )
}
