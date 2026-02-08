import crypto from 'node:crypto';

export type LemonEventName =
  | 'order_created'
  | 'order_refunded'
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_resumed'
  | 'subscription_expired'
  | 'subscription_payment_success'
  | 'subscription_payment_failed'
  | 'subscription_payment_recovered'
  | 'subscription_payment_refunded'
  | 'license_key_created'
  | 'license_key_updated'
  | string;

export type LemonWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, any>;
  };
};

export function verifyLemonSignature(params: {
  rawBody: Buffer;
  signatureHeader: string;
  signingSecret: string;
}): boolean {
  const { rawBody, signatureHeader, signingSecret } = params;
  const hmac = crypto.createHmac('sha256', signingSecret);
  const digestHex = hmac.update(rawBody).digest('hex');

  const digest = Buffer.from(digestHex, 'utf8');
  const signature = Buffer.from(signatureHeader ?? '', 'utf8');

  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(digest, signature);
}

export function parseLemonPayload(rawBody: Buffer): LemonWebhookPayload {
  return JSON.parse(rawBody.toString('utf8')) as LemonWebhookPayload;
}

export function getLemonEventName(headers: Record<string, string | string[] | undefined>, payload: LemonWebhookPayload): LemonEventName {
  // Lemon Squeezy sends X-Event-Name header.
  const h = headers['x-event-name'];
  const headerName = Array.isArray(h) ? h[0] : h;
  return (headerName ?? payload?.meta?.event_name ?? '').toString();
}

export function extractGithubUsernameFromLemon(payload: LemonWebhookPayload): string | null {
  const cd = payload?.meta?.custom_data ?? {};
  const candidates = [
    cd['github_username'],
    cd['github'],
    cd['githubUser'],
    cd['github_user']
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export function extractLemonOrderItem(payload: LemonWebhookPayload): {
  product_id?: number;
  variant_id?: number;
  product_name?: string;
  variant_name?: string;
} {
  const a = payload?.data?.attributes ?? {};
  const item = a.first_order_item ?? {};
  return {
    product_id: typeof item.product_id === 'number' ? item.product_id : undefined,
    variant_id: typeof item.variant_id === 'number' ? item.variant_id : undefined,
    product_name: typeof item.product_name === 'string' ? item.product_name : undefined,
    variant_name: typeof item.variant_name === 'string' ? item.variant_name : undefined
  };
}
