import type { GuideSeo } from '../lib/seo'

export type GuideArticle = GuideSeo & {
  lede: string
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>
}

export const guideArticles: GuideArticle[] = [
  {
    path: '/guides/docuseal-github',
    title: 'DocuSeal GitHub: what the repository actually ships',
    description:
      'A practical tour of the DocuSeal GitHub project: core signing features, deployment paths, and how to evaluate the codebase before you self-host or integrate.',
    h1: 'DocuSeal on GitHub',
    lede:
      'The upstream project is an open-source document filling and signing stack. If you are comparing stars to production readiness, start with the release cadence, security notes, and how you plan to operate SMTP and storage.',
    sections: [
      {
        heading: 'What you should read first in the repo',
        paragraphs: [
          'Skim the README for deployment targets (Docker, Compose, one-click hosts) and the license section so your legal team knows what AGPL means for your distribution model.',
          'Issues and discussions are often the fastest signal for edge cases: large PDFs, unusual field types, and SMTP deliverability.',
        ],
      },
      {
        heading: 'When GitHub is enough, and when it is not',
        paragraphs: [
          'GitHub is perfect for evaluation, forks, and hardening your own deployment. It is not a substitute for backups, monitoring, and a support path when signatures are business-critical.',
        ],
        bullets: [
          'Self-host if you need full control of data residency and custom retention.',
          'Use a managed layer if you want faster onboarding, predictable upgrades, and someone to call when a signer is stuck on mobile Safari.',
        ],
      },
    ],
  },
  {
    path: '/guides/docuseal-reviews',
    title: 'DocuSeal reviews: how to read them without getting fooled',
    description:
      'A calm framework for interpreting DocuSeal reviews: what matters for compliance-heavy teams, what is noise, and what to verify in your own pilot.',
    h1: 'DocuSeal reviews',
    lede:
      'Reviews cluster around two realities: the product is straightforward to try, and success still depends on how you configure email, storage, and identity expectations.',
    sections: [
      {
        heading: 'Separate “easy demo” from “easy rollout”',
        paragraphs: [
          'A smooth first template does not guarantee smooth bulk sends, reminders, or CSV-based invitations. Look for feedback from teams that operate at your volume.',
        ],
      },
      {
        heading: 'What to validate in a one-week pilot',
        paragraphs: [
          'Run a real template with your branding, your SMTP domain, and at least two external signers. Measure time-to-signed-PDF and the number of support touches.',
        ],
        bullets: [
          'Capture evidence: signed PDF, audit trail export, and webhook payloads if you integrate.',
          'Compare mobile completion rates, not just desktop.',
        ],
      },
    ],
  },
  {
    path: '/guides/docuseal-login',
    title: 'DocuSeal login: self-hosted access vs hosted signing links',
    description:
      'Understand DocuSeal login flows for administrators, submitters, and recipients so you do not confuse account access with signing access.',
    h1: 'DocuSeal login',
    lede:
      'DocuSeal separates operator accounts (people who build templates and manage users) from signing links (people who fill fields and sign). That split is intentional and affects how you train your team.',
    sections: [
      {
        heading: 'Administrator login',
        paragraphs: [
          'Operators typically authenticate to the web console on your deployment. Protect this surface like any admin tool: MFA where available, IP allowlists if appropriate, and audited role changes.',
        ],
      },
      {
        heading: 'Signer access without a “full account”',
        paragraphs: [
          'Recipients usually interact through time-bound links. That reduces friction, but it means your security story is partly about link handling, expiration, and anti-phishing training.',
        ],
      },
    ],
  },
  {
    path: '/guides/docuseal-docker',
    title: 'DocuSeal Docker: the fastest sane path to a private instance',
    description:
      'Run DocuSeal with Docker or Compose on your own machine or VPS: defaults, persistence, database options, and the operational checklist teams forget.',
    h1: 'DocuSeal Docker',
    lede:
      'The official image is designed to boot quickly with local SQLite by default. That is great for evaluation; production often moves to PostgreSQL or MySQL with backups and monitored disk growth.',
    sections: [
      {
        heading: 'Persistence and upgrades',
        paragraphs: [
          'Mount a volume for application data and treat upgrades like a product release: snapshot first, roll forward with a rollback plan, and verify PDF signing after each upgrade.',
        ],
      },
      {
        heading: 'SMTP and storage are the real work',
        paragraphs: [
          'Docker makes the app easy; email reputation and object storage configuration are where projects slow down. Budget time for DKIM/SPF alignment and a retention policy that matches your industry.',
        ],
      },
    ],
  },
  {
    path: '/guides/docuseal-react',
    title: 'DocuSeal React: embedding signing and builders cleanly',
    description:
      'Use DocuSeal React when you want embedded signing or a builder inside your app: integration boundaries, versioning, and what to keep on the server.',
    h1: 'DocuSeal React',
    lede:
      'Embedding shifts complexity from “another tab” to “your UI owns the frame.” That is powerful for conversion inside your product, but it also means you need clear error states and a fallback link if cookies or third-party scripts interfere.',
    sections: [
      {
        heading: 'Integration boundaries',
        paragraphs: [
          'Keep secrets off the client. Treat the embedded UI as a controlled surface: pass short-lived tokens, scope access narrowly, and log completion server-side via webhooks when possible.',
        ],
      },
      {
        heading: 'Versioning',
        paragraphs: [
          'Pin versions explicitly. Signing flows are sensitive to regressions, so adopt a release discipline similar to your payments code.',
        ],
      },
    ],
  },
  {
    path: '/guides/docuseal-download',
    title: 'DocuSeal download: images, compose files, and what “download” should mean',
    description:
      'Clarify what to download for DocuSeal (Docker image, compose file, source) and how to verify integrity before you deploy to production.',
    h1: 'DocuSeal download',
    lede:
      'Most teams do not need a “binary installer.” You pull a container image or clone the repository, then configure environment variables for URL, secrets, and storage.',
    sections: [
      {
        heading: 'Prefer pinned tags',
        paragraphs: [
          'Track a specific image tag or commit hash in your infrastructure repo. “Latest” is fine until the day it is not.',
        ],
      },
      {
        heading: 'Verify what you run',
        paragraphs: [
          'If compliance matters, record provenance: where the image was pulled from, who approved it, and how you scan dependencies in your supply chain process.',
        ],
      },
    ],
  },
  {
    path: '/guides/is-docuseal-legit',
    title: 'Is DocuSeal legit? A buyer’s checklist without the hype',
    description:
      'Evaluate DocuSeal legitimacy the same way you would any e-sign stack: licensing, security posture, operational fit, and your jurisdiction’s expectations.',
    h1: 'Is DocuSeal legit?',
    lede:
      'DocuSeal is a real open-source product with a public repository, a commercial offering, and a long list of teams using it for pragmatic workflows. “Legit” for you still means passing your own risk review.',
    sections: [
      {
        heading: 'What “legit” should mean for e-sign',
        paragraphs: [
          'You are checking for transparent licensing, a clear security story, predictable exports (signed PDFs, audit artifacts), and a deployment model you can support.',
        ],
        bullets: [
          'Read the license and additional terms if you redistribute or offer multi-tenant access.',
          'Validate signing and verification behavior with your legal counsel’s framework.',
        ],
      },
      {
        heading: 'Red flags that are not about the vendor',
        paragraphs: [
          'If your organization cannot maintain SMTP, backups, and access control, even a solid product will look “not legit” in production. Fix the operating model alongside the tool choice.',
        ],
      },
    ],
  },
  {
    path: '/guides/docuseal-alternative',
    title: 'DocuSeal alternative: shortlist criteria that keep evaluations honest',
    description:
      'Compare DocuSeal alternatives without stacking buzzwords: pricing mechanics, embedding, compliance exports, and how much control you need over data.',
    h1: 'DocuSeal alternative',
    lede:
      'Alternatives usually win on distribution, compliance packaging, or all-in-one suites. DocuSeal tends to win when teams want an open core, self-hosting flexibility, and straightforward PDF-native workflows.',
    sections: [
      {
        heading: 'Pick the decision axis first',
        paragraphs: [
          'If your primary constraint is enterprise procurement and bundled CLM, a suite vendor may fit better. If your constraint is predictable PDF signing with room to customize, DocuSeal-class tooling is often a better match.',
        ],
      },
      {
        heading: 'A practical scorecard',
        paragraphs: [
          'Score candidates on: total cost at your volume, webhook quality, mobile signer UX, data residency, and how painful bulk operations are.',
        ],
        bullets: [
          'Run the same pilot template on two finalists.',
          'Measure time-to-first-production-signature, not time-to-first-slide-deck.',
        ],
      },
    ],
  },
]

export function findGuideByPath(pathname: string): GuideArticle | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return guideArticles.find((g) => g.path === normalized) ?? null
}
