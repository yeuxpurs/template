export type GithubPermission = 'pull' | 'triage' | 'push' | 'maintain' | 'admin' | string;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

export function getRepoConfig() {
  const token = requiredEnv('GITHUB_TOKEN');
  const owner = requiredEnv('GITHUB_OWNER');
  const repo = requiredEnv('GITHUB_REPO');
  const permission = (process.env.GITHUB_PERMISSION ?? 'pull') as GithubPermission;
  return { token, owner, repo, permission };
}

export async function isCollaborator(params: {
  token: string;
  owner: string;
  repo: string;
  username: string;
}): Promise<boolean> {
  const { token, owner, repo, username } = params;
  const url = `https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (res.status === 204) return true;
  if (res.status === 404) return false;
  const body = await res.text();
  throw new Error(`GitHub isCollaborator unexpected status=${res.status} body=${body}`);
}

export async function addCollaborator(params: {
  token: string;
  owner: string;
  repo: string;
  username: string;
  permission?: GithubPermission;
}): Promise<void> {
  const { token, owner, repo, username, permission } = params;
  const url = `https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...githubHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(permission ? { permission } : {})
  });

  if (res.status === 201 || res.status === 204) return;
  const body = await res.text();
  throw new Error(`GitHub addCollaborator status=${res.status} body=${body}`);
}

export async function removeCollaborator(params: {
  token: string;
  owner: string;
  repo: string;
  username: string;
}): Promise<void> {
  const { token, owner, repo, username } = params;
  const url = `https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`;
  const res = await fetch(url, { method: 'DELETE', headers: githubHeaders(token) });
  if (res.status === 204 || res.status === 404) return; // 404 means already removed
  const body = await res.text();
  throw new Error(`GitHub removeCollaborator status=${res.status} body=${body}`);
}

export function normalizeGithubUsername(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const u = input.trim().replace(/^@/, '');
  // GitHub usernames: 1-39 chars, alnum or single hyphens, not starting/ending with hyphen.
  if (!u) return null;
  if (u.length > 39) return null;
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(u)) return null;
  return u;
}
