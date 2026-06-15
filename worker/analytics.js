const maxEventsPerRequest = 50
const maxMetadataLength = 4000
const analyticsSchemaReady = new WeakSet()

function sanitizeIdentifier(value, maxLength = 96) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:/?.#-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength)
  return normalized || null
}

function scopeIdentifier(siteKey, value, maxLength = 96) {
  const key = sanitizeIdentifier(siteKey, 64) || 'unknown'
  const normalized = sanitizeIdentifier(value, maxLength) || crypto.randomUUID()
  const prefix = `${key}:`
  if (normalized.startsWith(prefix)) return normalized.slice(0, maxLength)
  return `${prefix}${normalized}`.slice(0, maxLength)
}

function sanitizePath(value) {
  const raw = String(value ?? '/').trim()
  if (!raw || raw[0] !== '/') return '/'
  return raw.slice(0, 300)
}

function sanitizeString(value, maxLength = 240) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function sanitizeIso(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function inferEventType(eventName) {
  if (eventName === 'page_view') return 'page'
  if (eventName === 'content_view') return 'section'
  if (eventName === 'scroll_depth') return 'scroll'
  if (eventName.includes('click') || eventName.includes('cta') || eventName.includes('pricing_intent')) return 'click'
  if (eventName.includes('checkout') || eventName.includes('payment') || eventName.includes('plan')) return 'business'
  return 'unknown'
}

async function getTableColumns(db, tableName) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all()
  return new Set((result.results ?? []).map((row) => row.name))
}

async function addColumnIfMissing(db, tableName, columnName, ddl) {
  const columns = await getTableColumns(db, tableName)
  if (columns.has(columnName)) return
  await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`).run()
}

async function ensureAnalyticsSchema(db) {
  if (!db || analyticsSchemaReady.has(db)) return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      site_key TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT,
      order_id TEXT,
      event_type TEXT NOT NULL,
      event_name TEXT NOT NULL,
      hostname TEXT,
      route_path TEXT NOT NULL,
      page_key TEXT,
      section_key TEXT,
      element_key TEXT,
      referrer_host TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_term TEXT,
      utm_content TEXT,
      device_type TEXT,
      browser_language TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS analytics_sessions (
      id TEXT PRIMARY KEY,
      site_key TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      user_id TEXT,
      hostname TEXT,
      landing_path TEXT,
      referrer_host TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_term TEXT,
      utm_content TEXT,
      device_type TEXT,
      browser_language TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      section_view_count INTEGER NOT NULL DEFAULT 0,
      page_view_count INTEGER NOT NULL DEFAULT 0,
      last_event_name TEXT,
      last_route_path TEXT,
      last_stage TEXT NOT NULL DEFAULT 'unknown',
      started_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run()

  await addColumnIfMissing(db, 'analytics_events', 'site_key', "site_key TEXT NOT NULL DEFAULT 'unknown'")
  await addColumnIfMissing(db, 'analytics_events', 'hostname', 'hostname TEXT')
  await addColumnIfMissing(db, 'analytics_events', 'utm_source', 'utm_source TEXT')
  await addColumnIfMissing(db, 'analytics_events', 'utm_medium', 'utm_medium TEXT')
  await addColumnIfMissing(db, 'analytics_events', 'utm_campaign', 'utm_campaign TEXT')
  await addColumnIfMissing(db, 'analytics_events', 'utm_term', 'utm_term TEXT')
  await addColumnIfMissing(db, 'analytics_events', 'utm_content', 'utm_content TEXT')
  await addColumnIfMissing(db, 'analytics_events', 'device_type', 'device_type TEXT')
  await addColumnIfMissing(db, 'analytics_events', 'browser_language', 'browser_language TEXT')
  await addColumnIfMissing(db, 'analytics_sessions', 'site_key', "site_key TEXT NOT NULL DEFAULT 'unknown'")
  await addColumnIfMissing(db, 'analytics_sessions', 'hostname', 'hostname TEXT')

  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_events_site_idx ON analytics_events(site_key)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_events_site_session_idx ON analytics_events(site_key, session_id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_events_site_name_idx ON analytics_events(site_key, event_name)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_events_site_route_idx ON analytics_events(site_key, route_path)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_events_site_hostname_idx ON analytics_events(site_key, hostname)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_events_site_occurred_idx ON analytics_events(site_key, occurred_at)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_sessions_site_idx ON analytics_sessions(site_key)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_sessions_site_id_idx ON analytics_sessions(site_key, id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_sessions_site_visitor_idx ON analytics_sessions(site_key, visitor_id)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_sessions_site_stage_idx ON analytics_sessions(site_key, last_stage)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_sessions_site_hostname_idx ON analytics_sessions(site_key, hostname)').run()
  await db.prepare('CREATE INDEX IF NOT EXISTS analytics_sessions_site_started_idx ON analytics_sessions(site_key, started_at)').run()

  analyticsSchemaReady.add(db)
}

function normalizeEvent(rawEvent, { siteKey, requestUrl }) {
  const metadata = rawEvent?.metadata && typeof rawEvent.metadata === 'object' ? rawEvent.metadata : {}
  const rawName = rawEvent?.eventName ?? rawEvent?.name ?? metadata.eventName ?? 'unknown_event'
  const eventName = sanitizeIdentifier(rawName, 64) || 'unknown_event'
  const rawRoutePath = rawEvent?.routePath ?? rawEvent?.path ?? metadata.routePath ?? metadata.path ?? '/'
  const normalizedSiteKey = sanitizeIdentifier(siteKey, 64) || 'unknown'
  const rawEventId = rawEvent?.id ?? crypto.randomUUID()
  const rawSessionId =
    rawEvent?.sessionId ?? rawEvent?.session_id ?? metadata.sessionId ?? metadata.session_id ?? rawEvent?.id ?? crypto.randomUUID()
  let metadataJson = '{}'

  try {
    metadataJson = JSON.stringify(metadata)
  } catch {}

  if (metadataJson.length > maxMetadataLength) {
    metadataJson = metadataJson.slice(0, maxMetadataLength)
  }

  return {
    id: scopeIdentifier(normalizedSiteKey, rawEventId, 96),
    siteKey: normalizedSiteKey,
    visitorId: sanitizeIdentifier(
      rawEvent?.visitorId ?? rawEvent?.visitor_id ?? metadata.visitorId ?? metadata.visitor_id ?? rawEvent?.clientId ?? rawEvent?.anonymousId ?? 'anonymous',
      96,
    ),
    sessionId: scopeIdentifier(normalizedSiteKey, rawSessionId, 96),
    userId: sanitizeIdentifier(rawEvent?.userId, 96),
    orderId: sanitizeIdentifier(rawEvent?.orderId ?? metadata.orderId ?? metadata.order_id, 96),
    eventType: sanitizeIdentifier(rawEvent?.eventType, 32) || inferEventType(eventName),
    eventName,
    hostname: sanitizeString(rawEvent?.hostname ?? metadata.hostname ?? requestUrl.hostname, 180),
    routePath: sanitizePath(rawRoutePath),
    pageKey: sanitizeIdentifier(rawEvent?.pageKey ?? metadata.pageKey, 96),
    sectionKey: sanitizeIdentifier(rawEvent?.sectionKey ?? metadata.sectionKey ?? metadata.section, 96),
    elementKey: sanitizeIdentifier(rawEvent?.elementKey ?? metadata.elementKey ?? metadata.source ?? metadata.cta, 96),
    referrerHost: sanitizeString(rawEvent?.referrerHost, 180),
    utmSource: sanitizeString(rawEvent?.utmSource, 120),
    utmMedium: sanitizeString(rawEvent?.utmMedium, 120),
    utmCampaign: sanitizeString(rawEvent?.utmCampaign, 160),
    utmTerm: sanitizeString(rawEvent?.utmTerm, 160),
    utmContent: sanitizeString(rawEvent?.utmContent, 160),
    deviceType: sanitizeIdentifier(rawEvent?.deviceType, 32) || null,
    browserLanguage: sanitizeString(rawEvent?.browserLanguage, 64),
    metadataJson,
    occurredAt: sanitizeIso(rawEvent?.occurredAt),
  }
}

function normalizeRequestBodyToEvents(body) {
  if (Array.isArray(body?.events)) return body.events
  if (!body || typeof body !== 'object') return []

  const eventName = body.eventName ?? body.name ?? body.event ?? body.type ?? 'unknown_event'
  return [
    {
      id: body.id,
      eventName,
      path: body.path ?? body.route ?? body.routePath ?? '/',
      routePath: body.routePath ?? body.route ?? body.path ?? '/',
      visitorId: body.visitorId ?? body.visitor_id ?? body.clientId ?? body.anonymousId,
      sessionId: body.sessionId ?? body.session_id,
      referrerHost: body.referrerHost ?? body.referrer,
      utmSource: body.utmSource ?? body.utm?.source,
      utmMedium: body.utmMedium ?? body.utm?.medium,
      utmCampaign: body.utmCampaign ?? body.utm?.campaign,
      utmTerm: body.utmTerm ?? body.utm?.term,
      utmContent: body.utmContent ?? body.utm?.content,
      occurredAt: body.occurredAt ?? body.ts ?? body.timestamp,
      metadata: body,
    },
  ]
}

function resolveStage(event) {
  const pathOnly = event.routePath.split('?')[0] || '/'
  const name = event.eventName

  if (name === 'page_view' && pathOnly === '/') return 'landing_viewed'
  if (name === 'page_view' && pathOnly.startsWith('/pricing')) return 'pricing_viewed'
  if (name === 'page_view' && pathOnly.startsWith('/checkout')) return 'checkout_viewed'
  if (name === 'content_view' && event.sectionKey === 'pricing') return 'pricing_viewed'
  if (name === 'plan_selected' || name.startsWith('choose_') || name === 'billing_selected') return 'plan_selected'
  if (name === 'checkout_started' || name === 'checkout_start') return 'checkout_started'
  if (name === 'checkout_redirected' || name === 'checkout_opened' || name === 'checkout_popup_opened') return 'checkout_redirected'
  if (name === 'checkout_start_failed' || name === 'checkout_error' || name === 'checkout_popup_blocked') return 'checkout_start_failed'
  if (name === 'payment_completed' || name === 'checkout_complete_return' || name === 'checkout_completed_popup' || name === 'payment_success_landing') return 'payment_completed'
  if (name === 'cta_click' || name === 'primary_cta_click' || name === 'pricing_intent' || name.includes('_cta_')) return 'launch_clicked'
  if (pathOnly.startsWith('/console') || pathOnly.startsWith('/dashboard')) return 'console_viewed'
  return 'unknown'
}

function pickHigherStage(currentStage, nextStage) {
  const order = [
    'unknown', 'landing_viewed', 'pricing_viewed', 'launch_clicked',
    'plan_selected', 'checkout_viewed', 'checkout_started', 'checkout_redirected',
    'checkout_start_failed', 'payment_completed', 'console_viewed',
  ]
  return order.indexOf(nextStage) > order.indexOf(currentStage) ? nextStage : currentStage
}

async function upsertSession(db, event) {
  const stage = resolveStage(event)
  const now = new Date().toISOString()
  const existing = await db
    .prepare('SELECT last_stage FROM analytics_sessions WHERE site_key = ? AND id = ?')
    .bind(event.siteKey, event.sessionId)
    .first()

  if (existing) {
    const higherStage = pickHigherStage(existing.last_stage || 'unknown', stage)
    await db
      .prepare(
        `UPDATE analytics_sessions
         SET event_count = event_count + 1,
             click_count = click_count + ?,
             section_view_count = section_view_count + ?,
             page_view_count = page_view_count + ?,
             last_event_name = ?,
             last_route_path = ?,
             last_stage = ?,
             last_seen_at = ?,
             updated_at = ?
         WHERE site_key = ? AND id = ?`,
      )
      .bind(
        event.eventType === 'click' ? 1 : 0,
        event.eventName === 'content_view' ? 1 : 0,
        event.eventName === 'page_view' ? 1 : 0,
        event.eventName,
        event.routePath,
        higherStage,
        event.occurredAt,
        now,
        event.siteKey,
        event.sessionId,
      )
      .run()
    return
  }

  await db
    .prepare(
      `INSERT INTO analytics_sessions (
        id, site_key, visitor_id, user_id, hostname, landing_path, referrer_host,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        device_type, browser_language, event_count, click_count,
        section_view_count, page_view_count, last_event_name, last_route_path,
        last_stage, started_at, last_seen_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, 1, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
    )
    .bind(
      event.sessionId,
      event.siteKey,
      event.visitorId,
      event.userId,
      event.hostname,
      event.routePath,
      event.referrerHost,
      event.utmSource,
      event.utmMedium,
      event.utmCampaign,
      event.utmTerm,
      event.utmContent,
      event.deviceType,
      event.browserLanguage,
      event.eventType === 'click' ? 1 : 0,
      event.eventName === 'content_view' ? 1 : 0,
      event.eventName === 'page_view' ? 1 : 0,
      event.eventName,
      event.routePath,
      stage,
      event.occurredAt,
      event.occurredAt,
      now,
      now,
    )
    .run()
}

async function ingestEvents(db, rawEvents, options) {
  await ensureAnalyticsSchema(db)

  const events = rawEvents
    .slice(0, maxEventsPerRequest)
    .map((rawEvent) => normalizeEvent(rawEvent, options))
    .filter((event) => event.visitorId && event.sessionId)

  let ingested = 0

  for (const event of events) {
    const existingEvent = await db
      .prepare('SELECT id FROM analytics_events WHERE id = ?')
      .bind(event.id)
      .first()
    if (existingEvent) continue

    await upsertSession(db, event)

    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO analytics_events (
          id, site_key, visitor_id, session_id, user_id, order_id, event_type,
          event_name, hostname, route_path, page_key, section_key, element_key,
          referrer_host, utm_source, utm_medium, utm_campaign, utm_term,
          utm_content, device_type, browser_language, metadata_json,
          occurred_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.id,
        event.siteKey,
        event.visitorId,
        event.sessionId,
        event.userId,
        event.orderId,
        event.eventType,
        event.eventName,
        event.hostname,
        event.routePath,
        event.pageKey,
        event.sectionKey,
        event.elementKey,
        event.referrerHost,
        event.utmSource,
        event.utmMedium,
        event.utmCampaign,
        event.utmTerm,
        event.utmContent,
        event.deviceType,
        event.browserLanguage,
        event.metadataJson,
        event.occurredAt,
        new Date().toISOString(),
      )
      .run()

    if ((result.meta?.changes ?? result.changes ?? 0) > 0) {
      ingested++
    }
  }

  return { accepted: events.length, ingested }
}

export async function recordAnalyticsEvents(env, rawEvents, options) {
  const db = env?.DB ?? env?.ANALYTICS_DB
  if (!db) return { accepted: rawEvents.length, ingested: 0, persisted: false }

  const result = await ingestEvents(db, rawEvents, options)
  return { ...result, persisted: result.ingested > 0 }
}

export async function handleAnalyticsRequest(request, env, { siteKey = 'unknown' } = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rawEvents = normalizeRequestBodyToEvents(body)
  const db = env?.DB ?? env?.ANALYTICS_DB
  if (!db) {
    return new Response(
      JSON.stringify({ ok: true, message: 'Analytics events accepted without D1 binding.', accepted: rawEvents.length, ingested: 0, persisted: false }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const requestUrl = new URL(request.url)
    const result = await ingestEvents(db, rawEvents, { siteKey, requestUrl })
    return new Response(
      JSON.stringify({ ok: true, message: 'Analytics events accepted.', ...result, persisted: true }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'Invalid analytics request.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
