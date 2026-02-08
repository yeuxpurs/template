# Gatekeeper (payment → GitHub access)

This service receives payment webhooks and grants/revokes access to a private GitHub repository (your **Pro** template) by inviting users as collaborators.

## Supports

- Lemon Squeezy webhooks (signed HMAC)
- Gumroad Ping (protect with a secret token)

## Quick start

```bash
cd gatekeeper
cp .env.example .env
npm i
npm run dev
```

Health check:

```bash
curl http://localhost:8787/health
```

## Environment

- `GITHUB_TOKEN`: Fine-grained PAT or GitHub App token with repo administration rights
- `GITHUB_OWNER`, `GITHUB_REPO`: the private Pro repo that buyers should access
- `GITHUB_PERMISSION`: usually `pull`

- `LEMON_SIGNING_SECRET`: webhook signing secret (Lemon Squeezy)
- `GUMROAD_WEBHOOK_TOKEN`: long random string; Gumroad endpoint should be called with `?token=...`

## Endpoints

- `POST /webhooks/lemonsqueezy`
- `POST /webhooks/gumroad?token=...`

