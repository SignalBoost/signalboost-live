import type { MetadataRoute } from 'next'
import { publicSitemapEntries } from '@/lib/seo/publicSeo'

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemapEntries()
}
