'use client'

// saas/components/hub/ProviderMatrixSafetyBanner.tsx
// Display-only banner for applying the Provider Matrix concept safely.
// It does not read provider secrets, execute provider actions, or bypass Hub policy.

import { PROVIDER_MATRIX_BROWSER_RULES, providerMatrixDisplayLabel } from '@/lib/hub/provider-matrix-policy'

export default function ProviderMatrixSafetyBanner() {
  const chips = [
    ['Mode', providerMatrixDisplayLabel(PROVIDER_MATRIX_BROWSER_RULES.mode)],
    ['Actions', providerMatrixDisplayLabel(PROVIDER_MATRIX_BROWSER_RULES.providerActions)],
    ['Sensitive changes', providerMatrixDisplayLabel(PROVIDER_MATRIX_BROWSER_RULES.sensitiveChanges)],
    ['Credentials', providerMatrixDisplayLabel(PROVIDER_MATRIX_BROWSER_RULES.browserCredentialPolicy)],
    ['Audit', providerMatrixDisplayLabel(PROVIDER_MATRIX_BROWSER_RULES.auditPolicy)],
  ]

  return (
    <section
      aria-label="Provider Matrix safety policy"
      style={{
        border: '1px solid rgba(26,240,255,.22)',
        borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(26,240,255,.08), rgba(255,195,0,.05), rgba(3,7,18,0))',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#ffc300', fontSize: 11, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>
            Provider Matrix Guardrails
          </div>
          <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 12.5, marginTop: 4 }}>
            Provider status may be displayed here, but provider changes still run through Hub Actions or Infrastructure PR approval.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {chips.map(([label, value]) => (
          <span
            key={label}
            style={{
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,.12)',
              background: 'rgba(255,255,255,.045)',
              color: 'rgba(255,255,255,.75)',
              padding: '6px 8px',
              fontSize: 11,
              fontWeight: 850,
            }}
          >
            <strong style={{ color: '#1af0ff' }}>{label}:</strong> {value}
          </span>
        ))}
      </div>
    </section>
  )
}
