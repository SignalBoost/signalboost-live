export type ServiceSlug =
  | 'promote-business'
  | 'build-website'
  | 'collect-reviews'
  | 'generate-audio'
  | 'create-videos'
  | 'improve-website'
  | 'optimize-podcast-studio'
  | 'lab'
  | 'workshop-apprentice'

export type ServiceKey =
  | 'promote'
  | 'builder'
  | 'reviews'
  | 'audio'
  | 'video'
  | 'improve'
  | 'podcastStudio'
  | 'lab'
  | 'apprentice'

export type ServiceCatalogItem = {
  key: ServiceKey
  slug: ServiceSlug
  icon: string
  accent: string
  dashboardHref: string
  landingHref: string
  titleFallback: string
  descFallback: string
  ctaFallback: string
  inputType: 'upload' | 'url' | 'upload-url' | 'text'
}

export const SERVICES: ServiceCatalogItem[] = [
  { key: 'promote', slug: 'promote-business', icon: '📣', accent: '#ffc300', dashboardHref: '/dashboard/promote', landingHref: '/services/promote-business', titleFallback: 'Promote Business', descFallback: 'Launch localized campaigns, ad copy, outreach, and offers from one business brief.', ctaFallback: 'Open marketing tools', inputType: 'upload-url' },
  { key: 'builder', slug: 'build-website', icon: '🌐', accent: '#3b82f6', dashboardHref: '/dashboard/builder', landingHref: '/services/build-website', titleFallback: 'Build Website', descFallback: 'Generate a responsive multilingual site with structure, sections, and publish-ready calls to action.', ctaFallback: 'Open website builder', inputType: 'url' },
  { key: 'reviews', slug: 'collect-reviews', icon: '⭐', accent: '#f59e0b', dashboardHref: '/dashboard/reviews', landingHref: '/services/collect-reviews', titleFallback: 'Collect Reviews', descFallback: 'Create review links, follow-ups, and testimonial assets that turn trust into growth.', ctaFallback: 'Open review collection', inputType: 'url' },
  { key: 'audio', slug: 'generate-audio', icon: '🎙️', accent: '#a855f7', dashboardHref: '/dashboard/audio', landingHref: '/services/generate-audio', titleFallback: 'Generate Audio', descFallback: 'Turn scripts into natural voice content for promos, podcasts, explainers, and social clips.', ctaFallback: 'Open audio studio', inputType: 'upload-url' },
  { key: 'video', slug: 'create-videos', icon: '🎬', accent: '#ef4444', dashboardHref: '/dashboard/video', landingHref: '/services/create-videos', titleFallback: 'Create Videos', descFallback: 'Plan, script, generate, and package short-form videos with AI-guided production steps.', ctaFallback: 'Open video creator', inputType: 'upload-url' },
  { key: 'improve', slug: 'improve-website', icon: '🧭', accent: '#22c55e', dashboardHref: '/dashboard/improve', landingHref: '/services/improve-website', titleFallback: 'Improve Website', descFallback: 'Audit any URL for clarity, SEO, conversion, accessibility, and speed improvement opportunities.', ctaFallback: 'Open website optimization', inputType: 'url' },
  { key: 'podcastStudio', slug: 'optimize-podcast-studio', icon: '🎚️', accent: '#06b6d4', dashboardHref: '/dashboard/podcast/studio', landingHref: '/services/optimize-podcast-studio', titleFallback: 'Optimize Podcast Studio', descFallback: 'Improve episode workflow, transcript quality, clips, titles, metadata, and multilingual distribution.', ctaFallback: 'Open podcast optimization', inputType: 'upload-url' },
  { key: 'lab', slug: 'lab', icon: '🧪', accent: '#84cc16', dashboardHref: '/dashboard/lab', landingHref: '/services/lab', titleFallback: 'Lab', descFallback: 'Experiment with search, motion prompts, captions, and emerging AI workflows before they graduate.', ctaFallback: 'Open lab', inputType: 'upload-url' },
  { key: 'apprentice', slug: 'workshop-apprentice', icon: '🛠️', accent: '#fb7185', dashboardHref: '/dashboard/apprentice', landingHref: '/services/workshop-apprentice', titleFallback: 'Workshop Apprentice', descFallback: 'Follow guided tutorials and visual examples for every SignalBoost service.', ctaFallback: 'Start tutorial', inputType: 'text' },
]

export function getServiceBySlug(slug: string) {
  return SERVICES.find((service) => service.slug === slug)
}

export function getServiceByKey(key: ServiceKey) {
  return SERVICES.find((service) => service.key === key)
}
