const CANONICAL_ORIGIN = 'https://docuseal.space'
const CANONICAL_HOST = 'docuseal.space'
const LEGACY_HOSTS = new Set(['www.docuseal.space'])
const ANNUAL_DISCOUNT_MULTIPLIER = 0.5

const creemProductCache = new Map()

const planCatalog = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyAmountCents: 1900,
    currency: 'USD',
    summary: 'first live PDF signing templates',
  },
  team: {
    id: 'team',
    name: 'Team',
    monthlyAmountCents: 4900,
    currency: 'USD',
    summary: 'unlimited templates, signer roles, CSV bulk send, and audit-ready exports',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    monthlyAmountCents: 12900,
    currency: 'USD',
    summary: 'embedded signing and higher-volume compliance workflows',
  },
}

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

async function getSecretValue(value) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value.get === 'function') {
    const resolved = await value.get()
    return typeof resolved === 'string' ? resolved.trim() : ''
  }
  return ''
}

async function firstSecretEnv(env, ...keys) {
  for (const key of keys) {
    const value = await getSecretValue(env?.[key])
    if (value) return value
  }
  return ''
}

function normalizeEnvKey(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function formatMoney(amountCents, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100)
}

function resolveConfiguredProductId(env, planId, billing) {
  const cycle = billing === 'monthly' ? 'MONTHLY' : 'YEARLY'
  const tier = planId === 'starter' ? 'STARTER' : planId === 'scale' ? 'SCALE' : 'TEAM'
  const normalizedSelection = normalizeEnvKey(`${planId}_${billing}`)
  const keys = [
    `CREEM_PRODUCT_${tier}_${cycle}`,
    `CREEM_PRODUCT_ID_DOCUSEAL_${normalizedSelection}`,
    `CREEM_PRODUCT_ID_${normalizedSelection}`,
    `CREEM_PRODUCT_ID_${tier}`,
    'CREEM_PRODUCT_ID',
  ]

  for (const key of keys) {
    const value = env?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

async function requestCreemJson(apiKey, url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  const rawText = await response.text()
  let payload = null
  if (rawText) {
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object'
        ? payload.message || payload.error || 'Creem request failed.'
        : 'Creem request failed.',
    )
  }

  return payload || {}
}

async function getOrCreateCreemProduct(env, apiKey, plan, billing) {
  const configuredProductId = resolveConfiguredProductId(env, plan.id, billing)
  if (configuredProductId) return configuredProductId

  const cacheKey = `${plan.id}:${billing}`
  if (creemProductCache.has(cacheKey)) return creemProductCache.get(cacheKey)

  const monthlyAmountCents =
    billing === 'annual' ? Math.round(plan.monthlyAmountCents * ANNUAL_DISCOUNT_MULTIPLIER) : plan.monthlyAmountCents
  const totalAmountCents = billing === 'annual' ? monthlyAmountCents * 12 : monthlyAmountCents
  const billingLabel = billing === 'annual' ? 'annual' : 'monthly'

  const product = await requestCreemJson(apiKey, `${resolveCreemBase(env)}/v1/products`, {
    name: `DocuSeal Cloud ${plan.name} (${billingLabel})`,
    description: `${formatMoney(monthlyAmountCents, plan.currency)}/mo - ${plan.summary}`,
    price: totalAmountCents,
    currency: plan.currency,
    billing_type: 'onetime',
    tax_mode: 'inclusive',
    tax_category: 'saas',
    default_success_url: `${CANONICAL_ORIGIN}/checkout/done`,
  })

  const productId = product.id || product.product_id
  if (!productId) throw new Error('Creem did not return a product id.')

  creemProductCache.set(cacheKey, productId)
  return productId
}

function extractCheckoutUrl(payload) {
  const candidates = [payload?.checkout_url, payload?.checkoutUrl, payload?.url]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
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
    const apiKey = await firstSecretEnv(env, 'API_PROD_KEY', 'CREEM_API_KEY', 'CREEM_KEY')
    if (!apiKey) {
      return jsonResponse({ ok: false, error: 'Payment is not configured yet.' }, 503)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400)
    }

    const planId = typeof body?.planId === 'string' ? body.planId : 'team'
    const billing = typeof body?.billing === 'string' ? body.billing : 'annual'
    const plan = planCatalog[planId] || planCatalog.team
    const normalizedBilling = billing === 'monthly' ? 'monthly' : 'annual'

    try {
      const productId = await getOrCreateCreemProduct(env, apiKey, plan, normalizedBilling)
      const checkout = await requestCreemJson(apiKey, `${resolveCreemBase(env)}/v1/checkouts`, {
        product_id: productId,
        units: 1,
        success_url: `${CANONICAL_ORIGIN}/checkout/done`,
        request_id: `docuseal_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        metadata: {
          site: 'docuseal.space',
          planId: plan.id,
          billing: normalizedBilling,
        },
      })
      const checkoutUrl = extractCheckoutUrl(checkout)
      if (!checkoutUrl) throw new Error('Creem did not return a checkout URL.')
      return jsonResponse({ ok: true, checkoutUrl })
    } catch {
      return jsonResponse({ ok: false, error: 'Secure checkout could not be created yet.' }, 502)
    }
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
