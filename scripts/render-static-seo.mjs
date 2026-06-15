import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve('dist')
const siteName = 'DocuSeal Cloud'
const origin = 'https://docuseal.space'

const home = {
  path: '/',
  title: 'DocuSeal Space - Document Signing, PDF Templates, and E-Sign Workflows',
  description:
    'Run DocuSeal-class PDF templates, document signing, e-signatures, delivery workflows, audit trails, and team handoff from one hosted workspace.',
  robots: 'index,follow',
}

const routes = [
  home,
  {
    path: '/guides/docuseal-github',
    title: 'DocuSeal GitHub: what the repository actually ships | DocuSeal Cloud',
    description:
      'A practical tour of the DocuSeal GitHub project: core signing features, deployment paths, and how to evaluate the codebase before you self-host or integrate.',
    h1: 'DocuSeal on GitHub',
    robots: 'index,follow',
  },
  {
    path: '/guides/docuseal-reviews',
    title: 'DocuSeal reviews: how to read them without getting fooled | DocuSeal Cloud',
    description:
      'A calm framework for interpreting DocuSeal reviews: what matters for compliance-heavy teams, what is noise, and what to verify in your own pilot.',
    h1: 'DocuSeal reviews',
    robots: 'index,follow',
  },
  {
    path: '/guides/docuseal-login',
    title: 'DocuSeal login: self-hosted access vs hosted signing links | DocuSeal Cloud',
    description:
      'Understand DocuSeal login flows for administrators, submitters, and recipients so you do not confuse account access with signing access.',
    h1: 'DocuSeal login',
    robots: 'index,follow',
  },
  {
    path: '/guides/docuseal-docker',
    title: 'DocuSeal Docker: the fastest sane path to a private instance | DocuSeal Cloud',
    description:
      'Run DocuSeal with Docker or Compose on your own machine or VPS: defaults, persistence, database options, and the operational checklist teams forget.',
    h1: 'DocuSeal Docker',
    robots: 'index,follow',
  },
  {
    path: '/guides/docuseal-react',
    title: 'DocuSeal React: embedding signing and builders cleanly | DocuSeal Cloud',
    description:
      'Use DocuSeal React when you want embedded signing or a builder inside your app: integration boundaries, versioning, and what to keep on the server.',
    h1: 'DocuSeal React',
    robots: 'index,follow',
  },
  {
    path: '/guides/docuseal-download',
    title: 'DocuSeal download: images, compose files, and what download should mean | DocuSeal Cloud',
    description:
      'Clarify what to download for DocuSeal (Docker image, compose file, source) and how to verify integrity before you deploy to production.',
    h1: 'DocuSeal download',
    robots: 'index,follow',
  },
  {
    path: '/guides/is-docuseal-legit',
    title: "Is DocuSeal legit? A buyer's checklist without the hype | DocuSeal Cloud",
    description:
      "Evaluate DocuSeal legitimacy the same way you would any e-sign stack: licensing, security posture, operational fit, and your jurisdiction's expectations.",
    h1: 'Is DocuSeal legit?',
    robots: 'index,follow',
  },
  {
    path: '/guides/docuseal-alternative',
    title: 'DocuSeal alternative: shortlist criteria that keep evaluations honest | DocuSeal Cloud',
    description:
      'Compare DocuSeal alternatives without stacking buzzwords: pricing mechanics, embedding, compliance exports, and how much control you need over data.',
    h1: 'DocuSeal alternative',
    robots: 'index,follow',
  },
  {
    path: '/privacy',
    title: 'Privacy | DocuSeal Cloud',
    description: 'How DocuSeal Cloud handles analytics, billing, and support communications.',
    robots: 'index,follow',
  },
  {
    path: '/terms',
    title: 'Terms | DocuSeal Cloud',
    description: 'Terms of service for using DocuSeal Cloud templates, billing, and hosted workflows.',
    robots: 'index,follow',
  },
  {
    path: '/checkout/done',
    title: 'Checkout | DocuSeal Cloud',
    description: 'Completing your checkout session.',
    robots: 'noindex,nofollow',
  },
]

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function canonicalFor(routePath) {
  const normalized = routePath.replace(/\/+$/, '') || '/'
  return new URL(normalized, `${origin}/`).toString()
}

function upsertHeadTag(html, pattern, tag) {
  if (pattern.test(html)) {
    return html.replace(pattern, tag)
  }
  return html.replace('</head>', `    ${tag}\n  </head>`)
}

function upsertMeta(html, attr, key, content) {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`
  const pattern = new RegExp(`<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 's')
  return upsertHeadTag(html, pattern, tag)
}

function structuredDataFor(route) {
  const canonicalUrl = canonicalFor(route.path)
  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: route.title,
    description: route.description,
    url: canonicalUrl,
  }

  if (route.path === '/') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          name: siteName,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
          },
          description: route.description,
          url: canonicalUrl,
        },
        { ...webPage, '@context': undefined },
      ].map((item) => {
        const { '@context': _context, ...rest } = item
        return rest
      }),
    }
  }

  if (route.path.startsWith('/guides/')) {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        { ...webPage, '@context': undefined },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: canonicalFor('/') },
            { '@type': 'ListItem', position: 2, name: route.h1, item: canonicalUrl },
          ],
        },
      ],
    }
  }

  return webPage
}

function renderSeo(baseHtml, route) {
  const canonicalUrl = canonicalFor(route.path)
  let html = baseHtml
  html = upsertHeadTag(html, /<title>.*?<\/title>/s, `<title>${escapeHtml(route.title)}</title>`)
  html = upsertMeta(html, 'name', 'description', route.description)
  html = upsertMeta(html, 'name', 'robots', route.robots)
  html = upsertHeadTag(
    html,
    /<link\s+rel="canonical"[^>]*>/s,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
  )
  html = upsertMeta(html, 'property', 'og:title', route.title)
  html = upsertMeta(html, 'property', 'og:description', route.description)
  html = upsertMeta(html, 'property', 'og:url', canonicalUrl)
  html = upsertMeta(html, 'name', 'twitter:title', route.title)
  html = upsertMeta(html, 'name', 'twitter:description', route.description)
  html = upsertHeadTag(
    html,
    /<script\s+id="docuseal-structured-data"[^>]*>.*?<\/script>/s,
    `<script id="docuseal-structured-data" type="application/ld+json">${JSON.stringify(structuredDataFor(route))}</script>`,
  )
  return html
}

function outputPathFor(routePath) {
  if (routePath === '/') return path.join(distDir, 'index.html')
  return path.join(distDir, routePath.replace(/^\/+/, ''), 'index.html')
}

const baseHtml = await readFile(path.join(distDir, 'index.html'), 'utf8')

for (const route of routes) {
  const filePath = outputPathFor(route.path)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, renderSeo(baseHtml, route), 'utf8')
}

console.log(`Rendered static SEO HTML for ${routes.length} routes.`)
