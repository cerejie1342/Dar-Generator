import type { Commit, CommitFile, Repo, RepoSelection } from '../types';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GitHubError';
  }
}

async function gh<T>(path: string, token: string): Promise<{ data: T; link: string | null }> {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 401) {
    throw new GitHubError('GitHub rejected the token (401). Check that the PAT is valid and not expired.', 401);
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const reset = res.headers.get('x-ratelimit-reset');
      const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'shortly';
      throw new GitHubError(`GitHub rate limit reached. Try again after ${when}.`, res.status);
    }
    throw new GitHubError('GitHub denied the request (403). The token may be missing repository read access.', 403);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json())?.message ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new GitHubError(`GitHub API error (${res.status}): ${detail}`, res.status);
  }

  return { data: (await res.json()) as T, link: res.headers.get('link') };
}

function nextPage(link: string | null): string | null {
  if (!link) return null;
  const match = link.split(',').find((part) => part.includes('rel="next"'));
  return match ? (match.match(/<([^>]+)>/)?.[1] ?? null) : null;
}

async function ghAll<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = path;
  while (url) {
    const { data, link }: { data: T[]; link: string | null } = await gh<T[]>(url, token);
    out.push(...data);
    url = nextPage(link);
  }
  return out;
}

export async function getUser(token: string): Promise<{ login: string; name: string | null }> {
  const { data } = await gh<{ login: string; name: string | null }>('/user', token);
  return data;
}

interface ApiRepo {
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  pushed_at: string | null;
}

export async function listRepos(token: string): Promise<Repo[]> {
  const repos = await ghAll<ApiRepo>(
    '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
    token,
  );
  return repos.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    defaultBranch: r.default_branch,
    private: r.private,
  }));
}

export async function listBranches(token: string, fullName: string): Promise<string[]> {
  const branches = await ghAll<{ name: string }>(`/repos/${fullName}/branches?per_page=100`, token);
  return branches.map((b) => b.name);
}

interface ApiCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
  author: { login: string } | null;
}

export async function listCommits(
  token: string,
  fullName: string,
  branch: string,
  since: string,
  until: string,
  author?: string,
): Promise<Commit[]> {
  const params = new URLSearchParams({ per_page: '100', sha: branch, since, until });
  if (author) params.set('author', author);

  const commits = await ghAll<ApiCommit>(`/repos/${fullName}/commits?${params}`, token);
  return commits.map((c) => ({
    sha: c.sha,
    repo: fullName,
    message: c.commit.message,
    date: c.commit.author?.date ?? until,
    url: c.html_url,
    authorLogin: c.author?.login,
  }));
}

/**
 * Fetch commits across every selected repo/branch pair.
 *
 * Branches share history, so the same commit comes back once per branch that
 * contains it; deduplicating by SHA is what keeps a merged feature branch from
 * inflating the pool.
 */
export async function fetchCommits(
  token: string,
  selections: RepoSelection[],
  since: string,
  until: string,
  author?: string,
): Promise<Commit[]> {
  const pairs = selections.flatMap((s) =>
    s.branches.map((branch) => ({ fullName: s.fullName, branch })),
  );
  const results = await Promise.all(
    pairs.map((p) => listCommits(token, p.fullName, p.branch, since, until, author)),
  );
  const bySha = new Map<string, Commit>();
  for (const commit of results.flat()) {
    if (!bySha.has(commit.sha)) bySha.set(commit.sha, commit);
  }
  return [...bySha.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** The files a single commit touched, with their diffs. */
export async function listCommitFiles(
  token: string,
  fullName: string,
  sha: string,
): Promise<CommitFile[]> {
  const { data } = await gh<{ files?: CommitFile[] }>(`/repos/${fullName}/commits/${sha}`, token);
  return data.files ?? [];
}

/**
 * Attach the changed files to each commit. One API call per commit, run a few at
 * a time so a long reporting period does not open 200 sockets at once.
 */
export async function fetchCommitFiles(
  token: string,
  commits: Commit[],
  onProgress?: (done: number, total: number) => void,
): Promise<Commit[]> {
  const CONCURRENCY = 5;
  const out: Commit[] = [...commits];
  let done = 0;
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= out.length) return;
      const commit = out[i];
      try {
        out[i] = { ...commit, files: await listCommitFiles(token, commit.repo, commit.sha) };
      } catch {
        out[i] = { ...commit, files: [] }; // a single unreadable commit must not sink the batch
      }
      onProgress?.(++done, out.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, out.length) }, worker));
  return out;
}
