export function getPageContext(
  pathname: string | null | undefined
) {
  const path =
    pathname?.toLowerCase() || ''

  if (path.includes('dashboard')) {
    return 'dashboard'
  }

  if (path.includes('pricing')) {
    return 'pricing'
  }

  if (
    path.includes('video') ||
    path.includes('studio')
  ) {
    return 'video'
  }

  if (
    path.includes('review')
  ) {
    return 'reviews'
  }

  if (
    path.includes('website') ||
    path.includes('builder')
  ) {
    return 'website'
  }

  if (
    path.includes('growth')
  ) {
    return 'growth'
  }

  return 'default'
}
