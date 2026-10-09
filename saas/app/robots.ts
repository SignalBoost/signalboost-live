import type { MetadataRoute } from 'next'
import { PUBLIC_BRAND } from '@/lib/public-brand'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/dashboard/', '/browser-sandbox/', '/vault/'] },
    sitemap: `${PUBLIC_BRAND.siteUrl}/sitemap.xml`,
  }
}
