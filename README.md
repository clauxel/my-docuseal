# DocuSeal Cloud

Marketing and checkout site for **docuseal.space**. It uses Vite + React for the public site, Cloudflare Workers Assets for the primary deployment, and Cloudflare Pages as an automatic static mirror with Pages Functions for `/api/*`.

## Local

```bash
npm install
npm run dev
```

API routes need a Worker. In one terminal:

```bash
npx wrangler dev
```

## Cloudflare Worker

1. Deploy with `npm run cloudflare:deploy`.
2. Store one live Creem key as a Worker secret:

```bash
npx wrangler secret put API_PROD_KEY
```

Accepted aliases are `CREEM_API_KEY` or an account Secrets Store binding named `CREEM_KEY`.

Creem product IDs are optional. If these vars are omitted, the Worker creates matching one-time Creem products on demand:

```text
CREEM_PRODUCT_STARTER_MONTHLY
CREEM_PRODUCT_STARTER_YEARLY
CREEM_PRODUCT_TEAM_MONTHLY
CREEM_PRODUCT_TEAM_YEARLY
CREEM_PRODUCT_SCALE_MONTHLY
CREEM_PRODUCT_SCALE_YEARLY
```

Attach custom hostnames **docuseal.space** and **www.docuseal.space** to the Worker. Keep Cloudflare **Always Use HTTPS** enabled; the Worker and Pages Function also redirect HTTP and `www` to the apex HTTPS host.

## Cloudflare Pages

Create a Pages project named `my-docuseal` with build command `npm run build` and output directory `dist`. The repo includes:

- A Pages workflow step that writes `dist/_redirects` so SPA guide routes resolve to `index.html`.
- `functions/[[path]].js` so Pages can handle `/api/*` through the same Worker checkout/runtime logic.
- `.github/workflows/cloudflare-pages.yml`, which deploys Pages on pushes to `main`.

## GitHub Actions

Add repository secrets `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`, and `CLOUDFLARE_ACCOUNT_ID`. Pushes to `main` run both Worker and Pages deployment workflows.

## GitHub Repository

Repository target: `git@github.com:clauxel/my-docuseal.git`.

If GitHub API repository creation returns `403 Resource not accessible by personal access token`, use a PAT with repo creation rights or create the empty repo manually, then push `main`.

