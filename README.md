# GitHub Template Monetization Kit

This folder contains:

- `lite-template/` → public template repo skeleton (marketing + demo)
- `pro-template/` → private template repo skeleton (product)
- `gatekeeper/` → webhook service that grants/revokes access based on purchases

You typically create **two separate GitHub repositories** from `lite-template` and `pro-template`, then deploy `gatekeeper` somewhere (Vercel/Render/Fly/AWS/etc).
