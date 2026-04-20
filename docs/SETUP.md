# Missions — setup

What you need to run the app. The Otto slice works end-to-end once these are done.

## Prerequisites

- A Cloudflare account (free tier is fine)
- A domain you own (e.g. `polen.so`) — or use a subdomain (`missions.polen.so`)
- An Anthropic API key — https://console.anthropic.com

## Local development

```bash
git clone https://github.com/ox1138/missions.git
cd missions
npm install

# Log in so the Workers AI / Browser bindings can proxy in dev.
npx wrangler login

# Copy env template and fill in ANTHROPIC_API_KEY and HMAC_SECRET.
cp .dev.vars.example .dev.vars
$EDITOR .dev.vars

npm run dev
# Open http://localhost:5173
```

`wrangler login` is required the first time because the Workers AI binding
in `wrangler.jsonc` proxies to remote CF infrastructure. You only need to
log in once per machine.

## Remote deploy

```bash
# 1. Provision the R2 bucket Missions uses for attachments.
npx wrangler r2 bucket create missions

# 2. Set secrets (values live only in Cloudflare, never in the repo).
npx wrangler secret put ANTHROPIC_API_KEY   # paste your key
npx wrangler secret put HMAC_SECRET          # 32+ random bytes; e.g. openssl rand -hex 32

# 3. Edit wrangler.jsonc: set DOMAINS to your sending subdomain.
#    e.g. "DOMAINS": "missions.polen.so"

# 4. Deploy.
npm run deploy
```

## Cloudflare Access (required in production)

The inherited agentic-inbox middleware fails closed if `POLICY_AUD` and
`TEAM_DOMAIN` aren't set. After deploy:

1. In the Cloudflare dashboard → your Worker → **Settings → Domains &
   Routes**, enable one-click Cloudflare Access.
2. The modal shows a `POLICY_AUD` and `TEAM_DOMAIN` pair — set both as
   worker secrets:

   ```bash
   npx wrangler secret put POLICY_AUD
   npx wrangler secret put TEAM_DOMAIN
   ```

## Email Routing (inbound replies)

Missions needs inbound email for reply routing. You do **not** need to
provision per-agent addresses — Cloudflare Email Routing hands every
inbound message on your domain to the Worker, which routes by HMAC-signed
`Reply-To` tokens.

1. Cloudflare dashboard → your domain → **Email → Email Routing**.
2. Enable Email Routing. Cloudflare will add the MX and SPF DNS records.
3. Create a **Catch-all** rule and route it to your Worker (`missions`).

After this, any address on the zone — `otto@missions.polen.so`,
`reply+TOKEN@missions.polen.so`, anything — resolves to your deployed
Worker. The Missions layer inspects the `reply+` prefix first; the
fallback agentic-inbox mailbox handler claims the rest.

## Outbound delivery (optional for demo)

The default `send_email` binding requires the destination to be a
Cloudflare-verified forwarding address (intentional for reply-style
flows). This is enough to deliver to primed recipients — people who've
confirmed they want to receive agent emails.

For arbitrary outbound (cold outreach to any address), wire a
transactional provider like Resend, Postmark, or AWS SES. This isn't
shipped — it's a Phase 2 concern. The MVP demo assumes primed recipients.

## Run your first mission

Once the app is up and the bootstrap call has seeded your user row and
the three agent identities, open `/`, click **New mission**, and give
Otto a brief. Watch the activity stream — he'll send his own first-touch
email autonomously.
