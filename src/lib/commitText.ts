import type { Commit } from '../types';

const CONVENTIONAL = /^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert|wip|init)(\([^)]*\))?!?:\s*/i;
const MERGE = /^(merge (branch|pull request|remote-tracking)|revert ")/i;

/** First line of a commit message, without its conventional-commit prefix. */
export function cleanMessage(message: string): string {
  const first = message.split('\n')[0].trim();
  const stripped = first.replace(CONVENTIONAL, '').trim();
  if (!stripped) return '';
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** One day's commits collapsed into the text that goes in the DAR cell. */
export function summarize(commits: Commit[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const commit of commits) {
    const first = commit.message.split('\n')[0].trim();
    if (MERGE.test(first)) continue;
    const line = cleanMessage(commit.message);
    if (!line) continue;
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines.join('\n');
}
