import { handleRequest } from '../worker/index.js'

const CANONICAL_HOST = 'docuseal.space'
const LEGACY_HOSTS = new Set(['www.docuseal.space'])

function maybeRedirectToCanonical(request) {
  const url = new URL(request.url)
  if (url.protocol !== 'https:' || LEGACY_HOSTS.has(url.hostname)) {
    url.protocol = 'https:'
    url.hostname = CANONICAL_HOST
    return Response.redirect(url.toString(), 308)
  }
  return null
}

export async function onRequest(context) {
  const redirect = maybeRedirectToCanonical(context.request)
  if (redirect) return redirect

  const url = new URL(context.request.url)
  if (url.pathname.startsWith('/api/')) {
    return handleRequest(context.request, context.env)
  }

  return context.next()
}
