const CANONICAL_HOST = 'docuseal.space'
const LEGACY_HOSTS = new Set(['www.docuseal.space'])

export function onRequest(context) {
  const url = new URL(context.request.url)
  const needsHttps = url.protocol !== 'https:'
  const needsCanonicalHost = LEGACY_HOSTS.has(url.hostname)

  if (needsHttps || needsCanonicalHost) {
    url.protocol = 'https:'
    url.hostname = CANONICAL_HOST
    return Response.redirect(url.toString(), 308)
  }

  return context.next()
}
