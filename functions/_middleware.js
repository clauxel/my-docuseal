const CANONICAL_ORIGIN = "https://docuseal.space"
const CANONICAL_HOST = "docuseal.space"
const CANONICAL_HOSTS = new Set(["docuseal.space","www.docuseal.space"])
const INDEXABLE_PATHS = new Set(["/","/BingSiteAuth.xml","/guides/docuseal-alternative","/guides/docuseal-docker","/guides/docuseal-download","/guides/docuseal-github","/guides/docuseal-login","/guides/docuseal-react","/guides/docuseal-reviews","/guides/is-docuseal-legit","/llms.txt","/privacy","/public/google016b6dae8e59f4c0","/robots.txt","/server-card.json","/server.json","/sitemap.xml","/terms","/pricing","/resources"])
const SEO_FALLBACK_HTML = "<noscript data-seo-fallback=\"true\"><section><h1>DocuSeal Space - Document Signing, PDF Templates, and E-Sign Workflows</h1><p>Run DocuSeal-class PDF templates, document signing, e-signatures, delivery workflows, audit trails, and team handoff from one hosted workspace.</p></section></noscript>"
const MCP_REGISTRY_AUTH = null

function normalizePath(pathname) {
  let normalized = pathname || '/'
  normalized = normalized.replace(/\/+/g, '/')
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '')
  return normalized || '/'
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function hasFileExtension(pathname) {
  return /\.[a-z0-9]{2,12}$/i.test(pathname)
}

function isRuntimePath(pathname) {
  return pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/cdn-cgi/') ||
    pathname.startsWith('/.well-known/') ||
    pathname === '/mcp' ||
    pathname.startsWith('/mcp/') ||
    pathname === '/checkout' ||
    pathname.startsWith('/checkout/') ||
    pathname === '/success' ||
    pathname.startsWith('/success/') ||
    pathname === '/cancel' ||
    pathname.startsWith('/cancel/')
}

function noIndexNotFoundResponse() {
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Page not found</title></head><body><main><h1>Page not found</h1><p>This URL is not a public page for this product.</p></main></body></html>', {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

async function injectSeoFallback(response) {
  if (!SEO_FALLBACK_HTML || response.status !== 200) return response
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) return response
  const html = await response.text()
  if (html.includes('data-seo-fallback=')) return new Response(html, response)
  const nextHtml = html.includes('<body')
    ? html.replace(/<body([^>]*)>/i, '<body$1>' + SEO_FALLBACK_HTML)
    : SEO_FALLBACK_HTML + html
  return new Response(nextHtml, response)
}

export async function onRequest(context) {
  const request = context.request
  const url = new URL(request.url)
  const pathname = normalizePath(url.pathname)

  if (pathname === '/.well-known/mcp-registry-auth' && MCP_REGISTRY_AUTH) {
    return new Response(MCP_REGISTRY_AUTH, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  if (!isLocalHost(url.hostname) && CANONICAL_HOSTS.has(url.hostname) && (url.protocol !== 'https:' || url.hostname !== CANONICAL_HOST)) {
    url.protocol = 'https:'
    url.hostname = CANONICAL_HOST
    return Response.redirect(url.toString(), 301)
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && !isRuntimePath(pathname) && !hasFileExtension(pathname) && !INDEXABLE_PATHS.has(pathname)) {
    return noIndexNotFoundResponse()
  }

  const response = await context.next()
  if ((request.method === 'GET' || request.method === 'HEAD') && pathname === '/') {
    return injectSeoFallback(response)
  }
  return response
}
