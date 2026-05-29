export type PartnerIntentGroup = {
  key: 'website_optimization' | 'podcast_studio_optimization'
  label: string
  signals: string[]
  serviceHref: string
  outreachTemplate: string
}

export const PARTNER_INTENT_GROUPS: PartnerIntentGroup[] = [
  {
    key: 'website_optimization',
    label: 'Website Optimization',
    serviceHref: '/dashboard/improve',
    signals: ['slow website', 'old homepage', 'low conversion', 'missing SEO', 'accessibility issues', 'unclear CTA'],
    outreachTemplate: 'Hi {businessName}, I noticed an opportunity to improve your website clarity, SEO, accessibility, and conversion path. SignalBoost can produce a prioritized optimization checklist for {sourceUrl} and turn it into launch-ready updates.',
  },
  {
    key: 'podcast_studio_optimization',
    label: 'Podcast Studio Optimization',
    serviceHref: '/dashboard/podcast/studio',
    signals: ['podcast', 'episode clips', 'transcript', 'show notes', 'audio workflow', 'metadata'],
    outreachTemplate: 'Hi {businessName}, your show has room to create more reach from each episode. SignalBoost can optimize transcripts, clips, titles, show notes, and multilingual distribution from one podcast workflow.',
  },
]

export function renderPartnerOutreachTemplate(key: PartnerIntentGroup['key'], values: { businessName: string; sourceUrl?: string }) {
  const group = PARTNER_INTENT_GROUPS.find((item) => item.key === key)
  if (!group) return ''
  return group.outreachTemplate
    .replaceAll('{businessName}', values.businessName)
    .replaceAll('{sourceUrl}', values.sourceUrl || 'your current site')
}
