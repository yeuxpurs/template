// Gumroad Ping typically sends application/x-www-form-urlencoded.
// Many frameworks parse it into a flat object.

export type GumroadPingBody = Record<string, any>;

export function extractGithubUsernameFromGumroad(body: GumroadPingBody): string | null {
  // Common patterns people use with Gumroad custom fields:
  //   sale[custom_fields][github_username] = ...
  //   sale[custom_fields][github] = ...
  // Depending on parser, you might get nested objects.
  const nested = body?.sale?.custom_fields;
  const candidates = [
    nested?.github_username,
    nested?.github,
    nested?.githubUser,
    nested?.github_user,
    body?.github_username,
    body?.github
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export function isGumroadRefund(body: GumroadPingBody): boolean {
  // Gumroad Ping payloads differ; this is a best-effort.
  // If you need reliable revoke logic, use Gumroad APIs or handle manually.
  const refunded = body?.sale?.refunded;
  if (typeof refunded === 'boolean') return refunded;
  if (typeof refunded === 'string') return refunded.toLowerCase() === 'true' || refunded === '1';
  return false;
}
