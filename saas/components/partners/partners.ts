import partners from '@/data/partners.json'

export type Partner = {
  id: string
  name: string
  category: string
  url: string
  logoUrl: string
  affiliate: { default: string; regions: Record<string, string> }
}

export const PARTNERS = partners as Partner[]

export function getRegionAwareAffiliate(partner: Partner, region = 'US') {
  return partner.affiliate.regions[region.toUpperCase()] || partner.affiliate.default || partner.url
}
