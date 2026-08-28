# Ticket para o suporte do GitHub — certificado HTTPS travado

**Onde abrir:** https://support.github.com/contact → logado como `thiagozeni` →
categoria "GitHub Pages". Colar o texto abaixo.

---

**Subject:** Pages custom domain stuck in certificate state "new" — never starts provisioning (werdumfight.com)

**Body:**

Repository: `thiagozeni/3-contra-todos-game`
Custom domain: `werdumfight.com` (+ `www.werdumfight.com`)

The HTTPS certificate for my Pages custom domain expired on **2026-06-24** and
re-provisioning never starts. The API reports `https_certificate.state: "new"`
with description "This domain was recently added. The certificate request
process will begin shortly." — and it stays in that state indefinitely (3+ hours
observed). The server is still presenting the expired certificate
(notAfter = Jun 24 13:12:24 2026 GMT), so all HTTPS requests fail.

DNS is fully valid. The Pages health-check API
(`GET /repos/thiagozeni/3-contra-todos-game/pages/health`) returns for both
domains: `is_valid: true`, `is_https_eligible: true`, `caa_error: null`,
`is_proxied: false`, `is_served_by_pages: true`. The apex has the four standard
A records (185.199.108/109/110/111.153) and `www` is a CNAME to
`thiagozeni.github.io`. There are no CAA records on the zone. HTTP (port 80)
serves the site correctly.

Background: the domain was previously behind the Cloudflare proxy, which blocked
ACME renewal (hence the June 24 expiry). The proxy has been **disabled** (DNS
only) since 2026-07-01, so renewal should now be possible.

What I already tried, with no effect (state always returns to "new" and never
progresses):

1. Removing and re-adding the custom domain via
   `PUT /repos/{owner}/{repo}/pages` (several cycles, including a 2-hour wait
   and a ~9-hour window with the domain removed overnight).
2. Switching the site from legacy branch build to `build_type: workflow` and
   publishing fresh deployments via `actions/deploy-pages` (multiple successful
   deployments while the domain was attached).
3. Verifying there is no CAA restriction and no conflicting domain on my other
   repositories/accounts.

Could you please reset/kick the certificate provisioning for this domain? It
looks like the ACME order is stuck server-side and no user-facing action
triggers it.

Thank you!
