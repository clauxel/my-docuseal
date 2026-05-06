# DocuSeal Cloud

Marketing and checkout site for **docuseal.space** — built with Vite + React, deployed as a Cloudflare Worker with static assets. Checkout is created server-side via the Creem API (`/api/checkout`).

## Local

```bash
npm install
npm run dev
```

API routes need a Worker. In one terminal:

```bash
npx wrangler dev
```

Vite proxies `/api` to `http://127.0.0.1:8787` (see `vite.config.ts`).

## Cloudflare

1. `npm run cloudflare:deploy` (requires `CLOUDFLARE_API_TOKEN` with Workers edit scope).
2. `wrangler secret put CREEM_API_KEY`
3. In the Worker, set plain-text vars for each Creem product id:
   - `CREEM_PRODUCT_STARTER_MONTHLY`, `CREEM_PRODUCT_STARTER_YEARLY`
   - `CREEM_PRODUCT_TEAM_MONTHLY`, `CREEM_PRODUCT_TEAM_YEARLY`
   - `CREEM_PRODUCT_SCALE_MONTHLY`, `CREEM_PRODUCT_SCALE_YEARLY`
4. Attach custom hostnames **docuseal.space** and **www.docuseal.space** to the Worker. **SSL/TLS → Edge Certificates → Always Use HTTPS: On** (redirects `http` → `https`).

## GitHub Actions

Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Pushes to `main` run `.github/workflows/cloudflare.yml`.

## Cloudflare Pages (optional mirror)

Create a Pages project with root `docuseal`, build `npm run build`, output `dist`. The included `functions/[[path]].js` enforces HTTPS and apex canonical host for static hosting. **Hosted checkout still requires the Worker** (or duplicate `/api` in Pages Functions).
