const CANONICAL_ORIGIN = 'https://docuseal.space'
const CANONICAL_HOST = 'docuseal.space'
const LEGACY_HOSTS = new Set(['www.docuseal.space'])

function securityHeaders() {
  return new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  })
}

function jsonResponse(data, status = 200) {
  const headers = securityHeaders()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status, headers })
}

function maybeRedirectToCanonical(requestUrl) {
  if (requestUrl.protocol !== 'https:' || LEGACY_HOSTS.has(requestUrl.hostname)) {
    const redirectUrl = new URL(requestUrl)
    redirectUrl.protocol = 'https:'
    redirectUrl.hostname = CANONICAL_HOST
    return Response.redirect(redirectUrl.toString(), 308)
  }
  return null
}

function resolveCreemBase(env) {
  const raw = String(env?.CREEM_API_BASE ?? '').trim()
  if (raw) return raw.replace(/\/+$/, '')
  return 'https://api.creem.io'
}

function resolveProductId(env, planId, billing) {
  const cycle = billing === 'monthly' ? 'MONTHLY' : 'YEARLY'
  const tier = planId === 'starter' ? 'STARTER' : planId === 'scale' ? 'SCALE' : 'TEAM'
  const key = `CREEM_PRODUCT_${tier}_${cycle}`
  const value = env?.[key]
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return null
}

async function fetchAsset(request, env) {
  if (env?.ASSETS?.fetch) {
    return env.ASSETS.fetch(request)
  }
  return new Response('Cloudflare ASSETS binding is unavailable.', {
    status: 500,
    headers: securityHeaders(),
  })
}

export async function handleRequest(request, env) {
  const requestUrl = new URL(request.url)
  const redirect = maybeRedirectToCanonical(requestUrl)
  if (redirect) return redirect

  if (requestUrl.pathname === '/api/runtime') {
    return jsonResponse({
      ok: true,
      publicAppOrigin: CANONICAL_ORIGIN,
      deployment: 'cloudflare-workers-assets',
      ts: Date.now(),
    })
  }

  if (requestUrl.pathname === '/api/checkout' && request.method === 'POST') {
    const apiKey = env?.CREEM_API_KEY
    if (!apiKey || typeof apiKey !== 'string') {
      return jsonResponse({ ok: false, error: 'Checkout is not configured for this deployment.' }, 503)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400)
    }

    const planId = typeof body?.planId === 'string' ? body.planId : 'team'
    const billing = typeof body?.billing === 'string' ? body.billing : 'annual'
    const productId = resolveProductId(env, planId, billing)

    if (!productId) {
      return jsonResponse(
        {
          ok: false,
          error:
            'Missing Creem product mapping. Set CREEM_PRODUCT_TEAM_YEARLY (and related vars) in the Worker environment.',
        },
        503,
      )
    }

    const successUrl = `${CANONICAL_ORIGIN}/checkout/done`

    const creemRes = await fetch(`${resolveCreemBase(env)}/v1/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        product_id: productId,
        units: 1,
        success_url: successUrl,
        request_id: `docuseal_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      }),
    })

    const rawText = await creemRes.text()
    let payload = null
    if (rawText) {
      try {
        payload = JSON.parse(rawText)
      } catch {
        payload = null
      }
    }

    if (!creemRes.ok) {
      return jsonResponse(
        {
          ok: false,
          error: 'Creem checkout could not be created.',
          detail: payload && typeof payload === 'object' ? payload : rawText?.slice(0, 400),
        },
        502,
      )
    }

    const checkoutUrl =
      payload && typeof payload === 'object' && typeof payload.checkout_url === 'string'
        ? payload.checkout_url
        : null

    if (!checkoutUrl) {
      return jsonResponse({ ok: false, error: 'Creem response did not include checkout_url.' }, 502)
    }

    return jsonResponse({ ok: true, checkoutUrl })
  }

  return fetchAsset(request, env)
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env)
    } catch {
      return jsonResponse({ error: 'Internal server error' }, 500)
    }
  },
}
