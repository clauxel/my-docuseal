import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FileSignature, PenLine, ShieldCheck, Sparkles, X } from 'lucide-react'

import { guideArticles, findGuideByPath } from './content/guides'
import { buildSeoDocument, syncSeoDocument } from './lib/seo'
import { deriveRouteView, normalizePathname, scrollToHashTarget, type RouteView } from './lib/routing'

const defaultPublicAppOrigin = 'https://docuseal.space'

type Billing = 'monthly' | 'annual'

type PlanId = 'starter' | 'team' | 'scale'

const plans: Array<{
  id: PlanId
  name: string
  tagline: string
  monthlyUsd: number
  bullets: string[]
  popular?: boolean
}> = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For solo operators and first live templates.',
    monthlyUsd: 19,
    bullets: ['3 active templates', 'Email delivery', 'Webhook exports', 'Standard support'],
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'Where most companies stabilize signing volume.',
    monthlyUsd: 49,
    popular: true,
    bullets: ['Unlimited templates', 'Bulk send CSV', 'Roles and audit views', 'Priority support'],
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'For higher compliance scrutiny and embedded flows.',
    monthlyUsd: 129,
    bullets: ['Everything in Team', 'Embedded React surface', 'SSO assistance block', 'Dedicated onboarding'],
  },
]

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function usePathnameSignal() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin)
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setPathname(url.pathname)
    window.dispatchEvent(new PopStateEvent('popstate'))
    if (url.hash) {
      requestAnimationFrame(() => scrollToHashTarget(url.hash))
    }
  }, [])

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return { pathname, navigate, setPathname }
}

async function createCheckoutSession(planId: PlanId, billing: Billing) {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, billing }),
  })
  const payload = (await response.json()) as { ok?: boolean; checkoutUrl?: string; error?: string }
  if (!response.ok || !payload.ok || !payload.checkoutUrl) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Checkout could not be started.')
  }
  return payload.checkoutUrl
}

function CheckoutDoneBridge({ publicAppOrigin }: { publicAppOrigin: string }) {
  useEffect(() => {
    const origin = new URL(publicAppOrigin).origin

    if (window.parent !== window) {
      window.parent.postMessage({ type: 'docuseal-checkout-complete' }, origin)
      return
    }

    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'docuseal-checkout-complete' }, origin)
      } catch {
        /* ignore */
      }
      window.close()
      return
    }

    window.location.replace(`${origin}/?checkout=complete`)
  }, [publicAppOrigin])

  return (
    <div className="ds-section" style={{ textAlign: 'center', paddingTop: '120px' }}>
      <p style={{ color: '#475569', fontSize: '1.05rem' }}>Finishing checkout…</p>
    </div>
  )
}

export default function App() {
  const { pathname, navigate } = usePathnameSignal()
  const routeView: RouteView = useMemo(() => deriveRouteView(pathname), [pathname])
  const guide = useMemo(() => (routeView === 'guide' ? findGuideByPath(pathname) : null), [pathname, routeView])

  const [publicAppOrigin, setPublicAppOrigin] = useState(defaultPublicAppOrigin)
  const [headerCompact, setHeaderCompact] = useState(() => window.scrollY > 18)
  const [billing, setBilling] = useState<Billing>('annual')
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('team')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/runtime')
      .then((r) => r.json())
      .then((payload: { publicAppOrigin?: string }) => {
        if (!cancelled && typeof payload.publicAppOrigin === 'string' && payload.publicAppOrigin) {
          setPublicAppOrigin(payload.publicAppOrigin)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const seo = buildSeoDocument({
      pathname,
      routeView,
      publicAppOrigin,
      guide: guide
        ? { path: guide.path, title: guide.title, description: guide.description, h1: guide.h1 }
        : null,
    })
    syncSeoDocument(seo)
  }, [pathname, routeView, publicAppOrigin, guide])

  useEffect(() => {
    const onScroll = () => setHeaderCompact(window.scrollY > 18)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const allowed = new URL(publicAppOrigin).origin
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== allowed) return
      if (event.data?.type === 'docuseal-checkout-complete') {
        setCheckoutOpen(false)
        setCheckoutUrl(null)
        navigate('/?checkout=complete')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [navigate, publicAppOrigin])

  useEffect(() => {
    const hash = window.location.hash
    if (hash) {
      requestAnimationFrame(() => scrollToHashTarget(hash))
    }
  }, [pathname])

  const openCheckoutModal = useCallback(() => {
    setCheckoutError('')
    setCheckoutUrl(null)
    setCheckoutOpen(true)
  }, [])

  const startHostedCheckout = useCallback(async () => {
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const url = await createCheckoutSession(selectedPlan, billing)
      setCheckoutUrl(url)
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Checkout failed.')
    } finally {
      setCheckoutLoading(false)
    }
  }, [billing, selectedPlan])

  const normalizedPath = normalizePathname(pathname)

  const renderHeader = () => (
    <header className={`site-header${headerCompact ? ' site-header-compact' : ''}`}>
      <div className="header-inner">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        >
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ds" x1="12" y1="10" x2="86" y2="88" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#1e3a8a" />
                  <stop offset="1" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              <rect width="96" height="96" rx="22" fill="url(#ds)" />
              <path
                d="M26 58c10-22 30-34 48-38 2 12 1 24-4 36H34c-4-6-7-12-8-18Z"
                fill="#fff"
                opacity="0.92"
              />
              <path d="M48 24 64 34v28L48 72 32 62V34l16-10Z" fill="none" stroke="#c7d2fe" strokeWidth="4" />
            </svg>
          </span>
          <span className="brand-name">DocuSeal Cloud</span>
        </a>
        <nav className="ds-nav" aria-label="Primary">
          <a href="/#live-demo" onClick={() => navigate('/#live-demo')}>
            Live demo
          </a>
          <a href="/#pricing" onClick={() => navigate('/#pricing')}>
            Pricing
          </a>
          <a
            href="/guides/docuseal-github"
            onClick={(e) => {
              e.preventDefault()
              navigate('/guides/docuseal-github')
            }}
          >
            Guides
          </a>
        </nav>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button type="button" className="ds-btn ds-btn-ghost" onClick={openCheckoutModal}>
            Start now
          </button>
        </div>
      </div>
    </header>
  )

  const renderFooter = () => (
    <footer className="site-footer">
      <div className="footer-inner">
        <span>DocuSeal Cloud — hosted signing workflows built around open DocuSeal-class capabilities.</span>
        <span className="footer-divider">·</span>
        <a
          className="ds-link"
          href="/privacy"
          onClick={(e) => {
            e.preventDefault()
            navigate('/privacy')
          }}
        >
          Privacy
        </a>
        <span className="footer-divider">·</span>
        <a
          className="ds-link"
          href="/terms"
          onClick={(e) => {
            e.preventDefault()
            navigate('/terms')
          }}
        >
          Terms
        </a>
        <span className="footer-divider">·</span>
        <span>Guides:</span>{' '}
        {guideArticles.map((g, i) => (
          <span key={g.path}>
            {i > 0 ? <span className="footer-divider">·</span> : null}
            <a
              className="ds-link"
              href={g.path}
              onClick={(e) => {
                e.preventDefault()
                navigate(g.path)
              }}
            >
              {g.h1}
            </a>
          </span>
        ))}
      </div>
    </footer>
  )

  const renderHome = () => {
    const thanks = new URLSearchParams(window.location.search).get('checkout') === 'complete'
    return (
      <main className="ds-main">
        {thanks ? (
          <div
            className="container"
            style={{
              marginTop: '24px',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid rgba(34,197,94,0.35)',
              background: 'rgba(240,253,244,0.9)',
              color: '#14532d',
              fontWeight: 600,
            }}
          >
            <Check style={{ display: 'inline', verticalAlign: 'text-top', marginRight: 8 }} size={18} />
            Payment received. Your workspace will activate on the email you used at checkout.
          </div>
        ) : null}

        <div className="ds-hero-grid" id="top">
          <div className="ds-hero">
            <p className="ds-eyebrow">Open-core signing, without the science project</p>
            <h1>Send a PDF. Collect signatures. Keep the audit trail.</h1>
            <p className="ds-lede">
              DocuSeal Cloud packages the same practical surface area teams expect from DocuSeal-class tooling: templates,
              multi-signer flows, delivery, and exports — tuned so your first productive send happens this week, not next
              quarter.
            </p>
            <div className="ds-hero-actions">
              <button type="button" className="ds-btn ds-btn-primary" onClick={openCheckoutModal}>
                <Sparkles size={18} />
                Start with Team (annual)
              </button>
              <a className="ds-btn ds-btn-ghost" href="#live-demo" onClick={() => navigate('/#live-demo')}>
                Try the live surface
              </a>
            </div>
            <p className="ds-micro-trust">
              <ShieldCheck size={16} style={{ display: 'inline', verticalAlign: 'text-top', marginRight: 6 }} />
              SOC-minded defaults: HTTPS-only, explicit retention controls, and exports you can file away.
            </p>
          </div>
          <div className="ds-demo-panel" id="live-demo">
            <header>
              <span>
                <FileSignature size={16} style={{ display: 'inline', verticalAlign: 'text-top', marginRight: 8 }} />
                Live signing UI (public demo)
              </span>
              <span style={{ fontWeight: 600, color: '#64748b' }}>Mobile-ready</span>
            </header>
            <iframe
              className="ds-demo-frame"
              title="DocuSeal public demo"
              src="https://demo.docuseal.tech/"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="clipboard-write"
            />
          </div>
        </div>

        <section className="ds-section" aria-labelledby="how-it-works">
          <h2 id="how-it-works">Three moves. One calm pipeline.</h2>
          <p style={{ color: '#64748b', maxWidth: '62ch', marginTop: 0 }}>
            Most stalled rollouts are not missing features — they are missing a crisp first workflow. This is the one we
            optimize for.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
              gap: '16px',
              marginTop: '22px',
            }}
            className="ds-how-grid"
          >
            {[
              {
                title: 'Design the template',
                body: 'Drop in fields that match how your business actually signs — not a generic PDF graveyard.',
                icon: <PenLine size={20} />,
              },
              {
                title: 'Send a confident link',
                body: 'Recipients finish on a phone without installing anything. Fewer “can you resend?” messages.',
                icon: <Sparkles size={20} />,
              },
              {
                title: 'Archive what matters',
                body: 'Signed PDF plus structured events so finance and legal can sleep.',
                icon: <ShieldCheck size={20} />,
              },
            ].map((card) => (
              <div
                key={card.title}
                style={{
                  borderRadius: '16px',
                  border: '1px solid rgba(15,23,42,0.1)',
                  padding: '18px',
                  background: 'rgba(255,255,255,0.78)',
                }}
              >
                <div style={{ color: '#2563eb', marginBottom: '10px' }}>{card.icon}</div>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>{card.title}</h3>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section" id="pricing" aria-labelledby="pricing-head">
          <div className="ds-pricing-head">
            <div>
              <h2 id="pricing-head">Pick throughput, not buzzwords.</h2>
              <p style={{ color: '#64748b', margin: 0 }}>Annual is half the cost of paying month-by-month.</p>
            </div>
            <div className="ds-cycle" role="group" aria-label="Billing cycle">
              <button type="button" data-active={billing === 'monthly' ? 'true' : 'false'} onClick={() => setBilling('monthly')}>
                Monthly
              </button>
              <button type="button" data-active={billing === 'annual' ? 'true' : 'false'} onClick={() => setBilling('annual')}>
                Annual · 50% off
              </button>
            </div>
          </div>

          <div className="ds-plans">
            {plans.map((plan) => {
              const annualMonthly = plan.monthlyUsd * 0.5
              const displayMain = billing === 'annual' ? annualMonthly : plan.monthlyUsd
              const displayStrike = billing === 'annual' ? plan.monthlyUsd : null
              return (
                <div key={plan.id} className="ds-plan" data-popular={plan.popular ? 'true' : 'false'}>
                  {plan.popular ? <span className="ds-plan-badge">Most picked</span> : null}
                  <h3>{plan.name}</h3>
                  <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '0.9rem' }}>{plan.tagline}</p>
                  <div className="ds-price-line">
                    {formatMoney(displayMain)}
                    <small>/mo</small>
                    {displayStrike ? <span className="ds-strike">{formatMoney(displayStrike)}</span> : null}
                  </div>
                  {billing === 'annual' ? (
                    <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#16a34a', fontWeight: 700 }}>
                      Billed annually · save vs monthly
                    </p>
                  ) : (
                    <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#64748b' }}>Billed monthly</p>
                  )}
                  <ul>
                    {plan.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={plan.popular ? 'ds-btn ds-btn-primary' : 'ds-btn ds-btn-ghost'}
                    onClick={() => {
                      setSelectedPlan(plan.id)
                      openCheckoutModal()
                    }}
                  >
                    Choose {plan.name}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    )
  }

  const renderGuide = () => {
    if (!guide) return null
    return (
      <main className="ds-main">
        <article className="ds-guide">
          <a
            className="ds-link"
            href="/"
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
          >
            ← Back to home
          </a>
          <h1>{guide.h1}</h1>
          <p className="ds-lede">{guide.lede}</p>
          {guide.sections.map((section) => (
            <article key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </article>
      </main>
    )
  }

  const renderPrivacy = () => (
    <main className="ds-main">
      <article className="ds-guide">
        <h1>Privacy</h1>
        <p className="ds-lede">
          DocuSeal Cloud collects only what it needs to run billing, deliver the product, and respond to support. We do not
          sell personal data.
        </p>
        <article>
          <h2>What we process</h2>
          <p>Account email, payment metadata from our processor, product usage signals for reliability, and support threads you start.</p>
          <h2>Retention</h2>
          <p>You can export signed artifacts depending on your plan. Operational logs roll off on a fixed schedule.</p>
        </article>
      </article>
    </main>
  )

  const renderTerms = () => (
    <main className="ds-main">
      <article className="ds-guide">
        <h1>Terms</h1>
        <p className="ds-lede">
          By using DocuSeal Cloud you agree to use the service lawfully, keep credentials private, and pay fees when due.
        </p>
        <article>
          <h2>Service</h2>
          <p>Features follow the plan you purchase. We may update the product with reasonable notice for material changes.</p>
          <h2>Liability</h2>
          <p>The service is provided as-is to the extent permitted by law; your compliance program remains your responsibility.</p>
        </article>
      </article>
    </main>
  )

  const renderNotFound = () => (
    <main className="ds-main">
      <div className="ds-section">
        <h1>Page not found</h1>
        <p style={{ color: '#64748b' }}>That route does not exist.</p>
        <button type="button" className="ds-btn ds-btn-primary" style={{ marginTop: '16px' }} onClick={() => navigate('/')}>
          Go home
        </button>
      </div>
    </main>
  )

  let body: React.ReactNode
  if (routeView === 'home' && normalizedPath === '/') {
    body = renderHome()
  } else if (routeView === 'guide' && guide) {
    body = renderGuide()
  } else if (routeView === 'privacy') {
    body = renderPrivacy()
  } else if (routeView === 'terms') {
    body = renderTerms()
  } else if (routeView === 'checkout-done') {
    body = <CheckoutDoneBridge publicAppOrigin={publicAppOrigin} />
  } else {
    body = renderNotFound()
  }

  return (
    <div className="app-shell">
      <div className="background-grid" aria-hidden />
      <div className="background-glow glow-left" aria-hidden />
      <div className="background-glow glow-right" aria-hidden />
      {renderHeader()}
      {body}
      {renderFooter()}

      {checkoutOpen ? (
        <div className="ds-modal-root" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <button
            type="button"
            className="ds-modal-backdrop"
            aria-label="Close checkout"
            onClick={() => {
              if (!checkoutLoading) {
                setCheckoutOpen(false)
                setCheckoutUrl(null)
              }
            }}
          />
          <div className="ds-modal-card">
            <header>
              <span id="checkout-title">Secure checkout</span>
              <button
                type="button"
                className="ds-modal-close"
                onClick={() => {
                  if (!checkoutLoading) {
                    setCheckoutOpen(false)
                    setCheckoutUrl(null)
                  }
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
              <div className="ds-cycle" role="group" aria-label="Plan">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-active={selectedPlan === p.id ? 'true' : 'false'}
                    onClick={() => setSelectedPlan(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="ds-cycle" style={{ marginTop: '10px' }} role="group" aria-label="Billing">
                <button type="button" data-active={billing === 'monthly' ? 'true' : 'false'} onClick={() => setBilling('monthly')}>
                  Monthly
                </button>
                <button type="button" data-active={billing === 'annual' ? 'true' : 'false'} onClick={() => setBilling('annual')}>
                  Annual (-50%)
                </button>
              </div>
              {checkoutError ? (
                <p style={{ color: '#b91c1c', margin: '10px 0 0', fontSize: '0.9rem' }}>{checkoutError}</p>
              ) : null}
              {!checkoutUrl ? (
                <button
                  type="button"
                  className="ds-btn ds-btn-primary"
                  style={{ width: '100%', marginTop: '14px' }}
                  disabled={checkoutLoading}
                  onClick={() => void startHostedCheckout()}
                >
                  {checkoutLoading ? 'Starting…' : 'Continue to secure checkout'}
                </button>
              ) : (
                <p style={{ margin: '12px 0 0', fontSize: '0.88rem', color: '#64748b' }}>
                  If the frame stays blank,{' '}
                  <a className="ds-link" href={checkoutUrl} target="_blank" rel="noreferrer">
                    open checkout in a new tab
                  </a>
                  .
                </p>
              )}
            </div>
            {checkoutUrl ? <iframe className="ds-checkout-frame" title="Secure checkout" src={checkoutUrl} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
