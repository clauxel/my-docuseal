export function normalizePathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

export type RouteView =
  | 'home'
  | 'guide'
  | 'privacy'
  | 'terms'
  | 'checkout-done'
  | 'not-found'

const guidePaths = new Set([
  '/guides/docuseal-github',
  '/guides/docuseal-reviews',
  '/guides/docuseal-login',
  '/guides/docuseal-docker',
  '/guides/docuseal-react',
  '/guides/docuseal-download',
  '/guides/is-docuseal-legit',
  '/guides/docuseal-alternative',
])

export function deriveRouteView(pathname: string): RouteView {
  const normalized = normalizePathname(pathname)
  if (normalized === '/privacy') return 'privacy'
  if (normalized === '/terms') return 'terms'
  if (normalized === '/checkout/done') return 'checkout-done'
  if (guidePaths.has(normalized)) return 'guide'
  if (normalized === '/') return 'home'
  return 'not-found'
}

export function scrollToHashTarget(hash: string, behavior: ScrollBehavior = 'smooth') {
  if (!hash) return
  const target = document.querySelector(hash)
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior, block: 'start' })
  }
}
