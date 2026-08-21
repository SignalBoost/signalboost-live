// saas/lib/hub/provider-templates-partners.ts
// Affiliate partner administration belongs exclusively to the secondary/marketing
// Supabase project. This template deliberately uses provider id `supabase_mkt` so
// the portable action engine routes it to the secondary executor and credentials.

import type { ProviderTemplate } from './provider-templates.ts'

export const PARTNER_TEMPLATES: Record<string, ProviderTemplate> = {
  'supabase_mkt.upsert_partner': {
    id: 'supabase_mkt.upsert_partner',
    label: 'Add / Update Affiliate Partner',
    description: 'Save an affiliate partner directly to the secondary partner database. Never writes to primary Supabase.',
    icon: '🤝',
    previewBeforeSubmit: true,
    policyActionId: 'table_crud',
    api: { service: 'supabase_mkt', method: 'POST', endpoint: '/rest/v1/affiliate_partners' },
    fields: [
      { id: 'id', label: 'Partner ID', type: 'text', required: true, placeholder: 'partner-slug' },
      { id: 'name', label: 'Partner Name', type: 'text', required: true },
      { id: 'url', label: 'Affiliate URL', type: 'text', required: true },
      { id: 'network', label: 'Affiliate Network', type: 'text', placeholder: 'Awin' },
      { id: 'category', label: 'Category', type: 'text', defaultValue: 'specialty_other' },
      { id: 'category_label', label: 'Category Label', type: 'text' },
      { id: 'regions', label: 'Regions (JSON)', type: 'textarea', defaultValue: '["ot"]', help: 'Example: ["us","ot"]' },
      { id: 'description', label: 'Description', type: 'textarea' },
    ],
  },
}
