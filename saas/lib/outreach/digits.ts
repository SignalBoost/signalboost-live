import { createClient } from '@supabase/supabase-js'

export type DigitsPartnerBusiness = {
  id: string
  name: string
  website_url: string
  source_platform: string
  public_text?: string
  language?: string
}

export function getDigitsSupabase() {
  const url = process.env.DIGITS_SUPABASE_URL
  const key = process.env.DIGITS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function fetchDigitsPartnerBusinesses(limit = 25): Promise<DigitsPartnerBusiness[]> {
  const digits = getDigitsSupabase()
  if (!digits) return []

  const { data, error } = await digits
    .from('partner_businesses')
    .select('id,name,website_url,source_platform,public_text,language')
    .not('website_url', 'is', null)
    .limit(limit)

  if (error) throw new Error(error.message)

  return (data || []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name || 'Digits partner'),
    website_url: String(row.website_url),
    source_platform: String(row.source_platform || 'digits'),
    public_text: row.public_text ? String(row.public_text) : undefined,
    language: row.language ? String(row.language) : undefined,
  }))
}
