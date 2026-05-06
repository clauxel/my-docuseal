import type { RouteView } from './routing'

export type GuideSeo = {
  path: string
  title: string
  description: string
  h1: string
}

const siteName = 'DocuSeal Cloud'
const defaultTitle = 'DocuSeal Cloud | Document signing that ships in days, not quarters'
const defaultDescription =
  'Run DocuSeal-class PDF templates, e-signatures, and delivery workflows from one place. Built for teams that need fewer back-and-forth emails and a cleaner audit trail.'

const canonicalLinkId = 'docuseal-canonical-link'
const structuredDataScriptId = 'docuseal-structured-data'

type StructuredDataRecord = Record<string, unknown>

export type SeoDocument = {
  title: string
  description: string
  canonicalUrl: string
  robots: string
  structuredData: StructuredDataRecord[]
}

function normalizeOrigin(origin: string) {
  try {
    return new URL(origin).origin
  } catch {
    return typeof window !== 'undefined' ? window.location.origin : 'https://docuseal.space'
  }
}

function buildCanonicalUrl(origin: string, pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return new URL(normalized, `${normalizeOrigin(origin)}/`).toString()
}

function buildWebPageStructuredData(title: string, description: string, canonicalUrl: string): StructuredDataRecord {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonicalUrl,
  }
}

function buildBreadcrumb(origin: string, pathname: string, label: string): StructuredDataRecord {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: buildCanonicalUrl(origin, '/') },
      { '@type': 'ListItem', position: 2, name: label, item: buildCanonicalUrl(origin, pathname) },
    ],
  }
}

export function buildSeoDocument(args: {
  pathname: string
  routeView: RouteView
  publicAppOrigin: string
  guide: GuideSeo | null
}): SeoDocument {
  const { pathname, routeView, publicAppOrigin, guide } = args
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const canonicalUrl = buildCanonicalUrl(publicAppOrigin, normalized)

  if (routeView === 'not-found') {
    return {
      title: `Page not found | ${siteName}`,
      description: 'The page you requested is not available. Return to the homepage to continue.',
      canonicalUrl,
      robots: 'noindex,nofollow',
      structuredData: [buildWebPageStructuredData('Page not found', 'Missing page.', canonicalUrl)],
    }
  }

  if (routeView === 'checkout-done') {
    return {
      title: `Checkout | ${siteName}`,
      description: 'Completing your checkout session.',
      canonicalUrl,
      robots: 'noindex,nofollow',
      structuredData: [buildWebPageStructuredData('Checkout', 'Checkout completion.', canonicalUrl)],
    }
  }

  if (routeView === 'home') {
    return {
      title: defaultTitle,
      description: defaultDescription,
      canonicalUrl,
      robots: 'index,follow',
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: siteName,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
          },
          description: defaultDescription,
          url: canonicalUrl,
        },
        buildWebPageStructuredData(defaultTitle, defaultDescription, canonicalUrl),
      ],
    }
  }

  if (routeView === 'guide' && guide) {
    const title = `${guide.title} | ${siteName}`
    return {
      title,
      description: guide.description,
      canonicalUrl: buildCanonicalUrl(publicAppOrigin, guide.path),
      robots: 'index,follow',
      structuredData: [
        buildWebPageStructuredData(title, guide.description, buildCanonicalUrl(publicAppOrigin, guide.path)),
        buildBreadcrumb(publicAppOrigin, guide.path, guide.h1),
      ],
    }
  }

  if (routeView === 'privacy') {
    const title = `Privacy | ${siteName}`
    const description = 'How DocuSeal Cloud handles analytics, billing, and support communications.'
    return {
      title,
      description,
      canonicalUrl,
      robots: 'index,follow',
      structuredData: [buildWebPageStructuredData(title, description, canonicalUrl)],
    }
  }

  if (routeView === 'terms') {
    const title = `Terms | ${siteName}`
    const description = 'Terms of service for using DocuSeal Cloud templates, billing, and hosted workflows.'
    return {
      title,
      description,
      canonicalUrl,
      robots: 'index,follow',
      structuredData: [buildWebPageStructuredData(title, description, canonicalUrl)],
    }
  }

  return {
    title: defaultTitle,
    description: defaultDescription,
    canonicalUrl: buildCanonicalUrl(publicAppOrigin, '/'),
    robots: 'noindex,follow',
    structuredData: [buildWebPageStructuredData(defaultTitle, defaultDescription, canonicalUrl)],
  }
}

function upsertMeta(attributeName: 'name' | 'property', attributeValue: string, content: string) {
  let element = document.head.querySelector(`meta[${attributeName}="${attributeValue}"]`)
  if (!(element instanceof HTMLMetaElement)) {
    element = document.createElement('meta')
    element.setAttribute(attributeName, attributeValue)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function upsertCanonicalLink(href: string) {
  let element =
    (document.head.querySelector(`#${canonicalLinkId}`) as HTMLLinkElement | null) ??
    (document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)
  if (!(element instanceof HTMLLinkElement)) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }
  element.id = canonicalLinkId
  element.rel = 'canonical'
  element.href = href
}

function upsertStructuredData(structuredData: StructuredDataRecord[]) {
  let element = document.head.querySelector(`#${structuredDataScriptId}`) as HTMLScriptElement | null
  if (!(element instanceof HTMLScriptElement)) {
    element = document.createElement('script')
    element.id = structuredDataScriptId
    element.type = 'application/ld+json'
    document.head.appendChild(element)
  }
  const payload =
    structuredData.length <= 1
      ? structuredData[0] ?? {}
      : {
          '@context': 'https://schema.org',
          '@graph': structuredData.map((item) => {
            const { '@context': _context, ...rest } = item
            return rest
          }),
        }
  element.textContent = JSON.stringify(payload)
}

export function syncSeoDocument(seo: SeoDocument) {
  document.title = seo.title
  upsertMeta('name', 'description', seo.description)
  upsertMeta('name', 'robots', seo.robots)
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:site_name', siteName)
  upsertMeta('property', 'og:title', seo.title)
  upsertMeta('property', 'og:description', seo.description)
  upsertMeta('property', 'og:url', seo.canonicalUrl)
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', seo.title)
  upsertMeta('name', 'twitter:description', seo.description)
  upsertCanonicalLink(seo.canonicalUrl)
  upsertStructuredData(seo.structuredData)
}
