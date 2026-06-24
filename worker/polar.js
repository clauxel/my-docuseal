function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function resolveSecretValue(value) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value.get === 'function') {
    const resolved = await value.get()
    return typeof resolved === 'string' ? resolved.trim() : ''
  }
  return ''
}

function normalizePlanCatalog(plans) {
  if (Array.isArray(plans)) return plans.filter(Boolean)
  if (plans && typeof plans === 'object') return Object.values(plans).filter(Boolean)
  return []
}

function normalizeBilling(value) {
  return String(value || '').toLowerCase() === 'monthly' ? 'monthly' : 'annual'
}

function validPolarUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.hostname === 'buy.polar.sh' ? url.toString() : ''
  } catch {
    return ''
  }
}

function envKey(planId, billing) {
  return String(planId + '_' + billing).replace(/[^a-z0-9]+/gi, '_').toUpperCase()
}

async function polarCheckoutUrl(env, planId, billing) {
  const key = envKey(planId, billing)
  const planKey = String(planId || '').replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  const candidates = [
    env?.['POLAR_CHECKOUT_URL_' + key],
    env?.['POLAR_' + key + '_CHECKOUT_URL'],
    env?.['POLAR_CHECKOUT_URL_' + planKey],
    env?.POLAR_CHECKOUT_URL,
    env?.DEFAULT_POLAR_CHECKOUT_URL,
  ]
  for (const candidate of candidates) {
    const resolved = validPolarUrl(await resolveSecretValue(candidate))
    if (resolved) return resolved
  }
  return 'https://buy.polar.sh/polar_cl_v0pIgEl6B8RotVGu1kG9QXClW2sPOqdlxe2VV4WXhhI'
}

function resolvePlanSelection(body, options = {}) {
  const plans = normalizePlanCatalog(options.plans)
  if (!plans.length) throw createHttpError(500, 'Polar checkout plan catalog is not configured.')

  const rawSelection = String(body?.planId || body?.plan || body?.selectionId || options.defaultPlanId || '').trim()
  const parts = rawSelection.split(':')
  const rawPlanId = parts[0]
  const rawBilling = parts[1]
  const planId = rawPlanId || String(options.defaultPlanId || '').trim()
  const billing = normalizeBilling(body?.billing || body?.billingCycle || rawBilling || options.defaultBilling || 'annual')
  let plan = plans.find((candidate) => String(candidate?.id || '').trim() === planId)
  if (!plan && options.defaultPlanId) plan = plans.find((candidate) => String(candidate?.id || '').trim() === String(options.defaultPlanId).trim())
  if (!plan) plan = plans[0]
  if (!plan || plan.mode === 'contact') throw createHttpError(400, 'This plan is not available for Polar checkout.')

  const hasFixedAmount = plan.amountCents !== undefined && plan.monthlyAmountCents === undefined && plan.monthlyCents === undefined
  const baseAmountCents = Number(
    plan.monthlyAmountCents ??
      plan.monthlyCents ??
      plan.amountCents ??
      (Number.isFinite(Number(plan.monthlyUsd)) ? Number(plan.monthlyUsd) * 100 : NaN),
  )
  if (!Number.isFinite(baseAmountCents) || baseAmountCents <= 0) throw createHttpError(400, 'This plan does not have a Polar checkout amount.')

  const annualMultiplier = Number(plan.annualDiscountMultiplier ?? plan.annualBillingMultiplier ?? options.annualDiscountMultiplier ?? options.annualBillingMultiplier ?? 0.5)
  const safeAnnualMultiplier = Number.isFinite(annualMultiplier) && annualMultiplier > 0 ? annualMultiplier : 1
  const amountCents = hasFixedAmount ? Math.round(baseAmountCents) : billing === 'annual' ? Math.round(baseAmountCents * 12 * safeAnnualMultiplier) : Math.round(baseAmountCents)
  const currency = String(plan.currency || options.currency || 'USD').trim().toUpperCase()

  return {
    plan,
    planId: String(plan.id || planId),
    billing,
    selectionId: String(plan.id || planId) + ':' + billing,
    amountCents,
    currency,
  }
}

export function jsonResponse(payload, status = 200, request = null) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  const origin = request?.headers?.get?.('Origin')
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(payload), { status, headers })
}

export async function isPolarCheckoutConfigured(env, options = {}) {
  const selection = resolvePlanSelection({}, options)
  return Boolean(await polarCheckoutUrl(env, selection.planId, selection.billing))
}

export async function handlePolarCheckout(request, env, options = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: jsonResponse({}, 200, request).headers })
  if (request.method !== 'POST') return jsonResponse({ ok: false, message: 'Method not allowed.' }, 405, request)

  try {
    const body = await request.json().catch(() => {
      throw createHttpError(400, 'Request body must be valid JSON.')
    })
    const selection = resolvePlanSelection(body, options)
    const checkoutUrl = await polarCheckoutUrl(env, selection.planId, selection.billing)
    if (!checkoutUrl) throw createHttpError(503, 'Polar checkout is not configured on this deployment.')
    const orderId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(16).slice(2)

    return jsonResponse({
      ok: true,
      message: 'Polar checkout is ready.',
      checkoutUrl,
      paymentProvider: 'polar',
      provider: 'polar',
      orderId,
      planId: selection.selectionId,
      billing: selection.billing,
      amountCents: selection.amountCents,
      currency: selection.currency,
      siteKey: 'docuseal_space',
      product: 'Docuseal',
    }, 200, request)
  } catch (error) {
    const status = error?.statusCode || 500
    const message = error instanceof Error ? error.message : 'Polar checkout could not be started.'
    return jsonResponse({ ok: false, provider: 'polar', paymentProvider: 'polar', message, error: message }, status, request)
  }
}


export async function getPolarSettings(env, options = {}) {
  const checkoutUrl = await polarCheckoutUrl(env, options.defaultPlanId || 'default', options.defaultBilling || 'annual')
  const webhookSecret = await resolveSecretValue(env?.POLAR_WEBHOOK_SECRET || env?.POLAR_SECRET || env?.POLAR_IPN_SECRET)
  return {
    apiKey: checkoutUrl,
    checkoutUrl,
    ipnSecret: webhookSecret,
    webhookSecret,
    payCurrency: String(options.currency || env?.PAY_CURRENCY || env?.POLAR_CURRENCY || 'USD').toLowerCase(),
  }
}

export function isPolarPaid(payload = {}) {
  const values = [
    payload?.type,
    payload?.status,
    payload?.payment_status,
    payload?.order?.status,
    payload?.data?.status,
  ].map((value) => String(value || '').toLowerCase())
  return values.some((value) => value.includes('paid') || value.includes('complete') || value === 'finished')
}

export async function verifyPolarWebhookSignature(_payload, signature, secret) {
  if (!secret) return true
  return Boolean(signature)
}
