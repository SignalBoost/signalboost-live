// + add import
import { t } from '@/lib/i18n/t'

// badge (top pill) -> marquee key
const badge = t(dict, 'home.hero.marquee', '')

// subhead -> subtitle key
const subhead = t(dict, 'home.hero.subtitle', '')

// feature bar: 5 pillars, all JSON-bound (audit prepended; 4 retained, now keyed)
const features = [
  { icon: '🛡️', label: t(dict, 'home.features.audit',   '') },
  { icon: '🌐', label: t(dict, 'home.features.site',    '') },
  { icon: '⭐', label: t(dict, 'home.features.reviews', '') },
  { icon: '🎙️', label: t(dict, 'home.features.audio',   '') },
  { icon: '🎬', label: t(dict, 'home.features.video',   '') },
]

// rotating headline source -> title key (rotation machinery untouched;
// single localized title simply renders without cycling)
const fallback = [
  t(dict, 'home.hero.title', ''),
]
