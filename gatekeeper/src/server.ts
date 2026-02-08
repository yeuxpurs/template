import express from 'express';

import { addCollaborator, getRepoConfig, normalizeGithubUsername, removeCollaborator, isCollaborator } from './github.js';
import { extractGithubUsernameFromLemon, getLemonEventName, parseLemonPayload, verifyLemonSignature } from './providers/lemonsqueezy.js';
import { extractGithubUsernameFromGumroad, isGumroadRefund } from './providers/gumroad.js';

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// --- Lemon Squeezy webhook (JSON + signature) ---
app.post(
  '/webhooks/lemonsqueezy',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signingSecret = process.env.LEMON_SIGNING_SECRET;
      if (!signingSecret) throw new Error('Missing env: LEMON_SIGNING_SECRET');

      const signatureHeader = (req.header('X-Signature') ?? '').toString();
      const rawBody = req.body as Buffer;

      const ok = verifyLemonSignature({ rawBody, signatureHeader, signingSecret });
      if (!ok) return res.status(401).json({ ok: false, error: 'Invalid signature' });

      const payload = parseLemonPayload(rawBody);
      const eventName = getLemonEventName(lowerCaseHeaders(req.headers), payload);

      const ghRaw = extractGithubUsernameFromLemon(payload);
      const gh = normalizeGithubUsername(ghRaw);

      if (!gh) {
        // Don't retry forever; respond 200 but log.
        console.warn('[lemonsqueezy] missing/invalid github username', { eventName, ghRaw });
        return res.status(200).json({ ok: true, skipped: 'missing_github_username' });
      }

      const { token, owner, repo, permission } = getRepoConfig();

      // Decide grant/revoke based on event type.
      if (eventName === 'order_created' || eventName === 'subscription_created') {
        // Idempotency: if already collaborator, no-op.
        const already = await isCollaborator({ token, owner, repo, username: gh });
        if (!already) {
          await addCollaborator({ token, owner, repo, username: gh, permission });
          console.log('[lemonsqueezy] granted repo access', { gh, owner, repo, eventName });
        }
        return res.status(200).json({ ok: true, action: 'granted', gh });
      }

      if (
        eventName === 'order_refunded' ||
        eventName === 'subscription_expired' ||
        eventName === 'subscription_payment_refunded'
      ) {
        await removeCollaborator({ token, owner, repo, username: gh });
        console.log('[lemonsqueezy] revoked repo access', { gh, owner, repo, eventName });
        return res.status(200).json({ ok: true, action: 'revoked', gh });
      }

      // NOTE: subscription_cancelled enters grace period; you might choose NOT to revoke here.
      if (eventName === 'subscription_cancelled') {
        console.log('[lemonsqueezy] subscription_cancelled (no revoke by default)', { gh, owner, repo });
        return res.status(200).json({ ok: true, action: 'no-op', reason: 'grace_period', gh });
      }

      return res.status(200).json({ ok: true, action: 'ignored', eventName, gh });
    } catch (err: any) {
      console.error(err);
      // Lemon Squeezy retries non-200 responses.
      return res.status(500).json({ ok: false, error: err?.message ?? 'Unknown error' });
    }
  }
);

// --- Gumroad Ping (form-urlencoded, no strong signature) ---
app.post(
  '/webhooks/gumroad',
  express.urlencoded({ extended: false }),
  async (req, res) => {
    try {
      const expectedToken = process.env.GUMROAD_WEBHOOK_TOKEN;
      const providedToken = (req.query.token ?? '').toString();
      if (!expectedToken || providedToken !== expectedToken) {
        return res.status(401).json({ ok: false, error: 'Invalid token' });
      }

      const ghRaw = extractGithubUsernameFromGumroad(req.body);
      const gh = normalizeGithubUsername(ghRaw);
      if (!gh) {
        console.warn('[gumroad] missing/invalid github username', { ghRaw });
        return res.status(200).json({ ok: true, skipped: 'missing_github_username' });
      }

      const { token, owner, repo, permission } = getRepoConfig();
      const refund = isGumroadRefund(req.body);

      if (refund) {
        await removeCollaborator({ token, owner, repo, username: gh });
        console.log('[gumroad] revoked repo access', { gh, owner, repo });
        return res.status(200).json({ ok: true, action: 'revoked', gh });
      }

      const already = await isCollaborator({ token, owner, repo, username: gh });
      if (!already) {
        await addCollaborator({ token, owner, repo, username: gh, permission });
        console.log('[gumroad] granted repo access', { gh, owner, repo });
      }

      return res.status(200).json({ ok: true, action: 'granted', gh });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ ok: false, error: err?.message ?? 'Unknown error' });
    }
  }
);

// --- Manual admin endpoints (optional) ---
app.use(express.json());
app.post('/admin/grant', async (req, res) => {
  try {
    const adminKey = (process.env.ADMIN_KEY ?? '').trim();
    if (!adminKey) throw new Error('Missing env: ADMIN_KEY (optional)');
    if ((req.header('X-Admin-Key') ?? '') !== adminKey) return res.status(401).json({ ok: false });

    const gh = normalizeGithubUsername(req.body?.github);
    if (!gh) return res.status(400).json({ ok: false, error: 'Bad github' });

    const { token, owner, repo, permission } = getRepoConfig();
    await addCollaborator({ token, owner, repo, username: gh, permission });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? 'Unknown error' });
  }
});

app.post('/admin/revoke', async (req, res) => {
  try {
    const adminKey = (process.env.ADMIN_KEY ?? '').trim();
    if (!adminKey) throw new Error('Missing env: ADMIN_KEY (optional)');
    if ((req.header('X-Admin-Key') ?? '') !== adminKey) return res.status(401).json({ ok: false });

    const gh = normalizeGithubUsername(req.body?.github);
    if (!gh) return res.status(400).json({ ok: false, error: 'Bad github' });

    const { token, owner, repo } = getRepoConfig();
    await removeCollaborator({ token, owner, repo, username: gh });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? 'Unknown error' });
  }
});

function lowerCaseHeaders(headers: Record<string, any>): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v as any;
  }
  return out;
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`gatekeeper listening on http://localhost:${port}`);
});
