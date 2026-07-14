import { describe, it, expect } from 'vitest';
import { distribute, toDateKey } from './distribute';
import { summarize, cleanMessage } from './commitText';
import type { Commit } from '../types';

const commit = (sha: string, date: string, message = sha): Commit => ({
  sha,
  repo: 'me/repo',
  message,
  date: `${date}T09:00:00Z`,
  url: `https://github.com/me/repo/commit/${sha}`,
});

const flatten = (m: Map<string, Commit[]>) => [...m.values()].flat().map((c) => c.sha);

describe('distribute', () => {
  it('keeps each commit on its own date when that date is selected', () => {
    const dates = ['2026-06-18', '2026-06-19'];
    const result = distribute([commit('a', '2026-06-18'), commit('b', '2026-06-19')], dates);
    expect(result.get('2026-06-18')!.map((c) => c.sha)).toEqual(['a']);
    expect(result.get('2026-06-19')!.map((c) => c.sha)).toEqual(['b']);
  });

  it('never uses a commit twice', () => {
    const commits = ['a', 'b', 'c', 'd', 'e'].map((s, i) => commit(s, `2026-06-${18 + i}`));
    const result = distribute(commits, ['2026-06-18', '2026-06-22', '2026-06-23']);
    const used = flatten(result);
    expect(used.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(new Set(used).size).toBe(used.length);
  });

  it('deduplicates commits sharing a SHA', () => {
    const result = distribute([commit('a', '2026-06-18'), commit('a', '2026-06-18')], ['2026-06-18']);
    expect(result.get('2026-06-18')).toHaveLength(1);
  });

  it('lends commits to an empty day from a neighbour with a surplus', () => {
    // Three commits all landed on the 18th; the 19th and 22nd were also attended.
    const commits = [
      commit('a', '2026-06-18'),
      commit('b', '2026-06-18'),
      commit('c', '2026-06-18'),
    ];
    const result = distribute(commits, ['2026-06-18', '2026-06-19', '2026-06-22']);
    expect(result.get('2026-06-18')!.map((c) => c.sha)).toEqual(['a']);
    expect(result.get('2026-06-19')!.map((c) => c.sha)).toEqual(['b']);
    expect(result.get('2026-06-22')!.map((c) => c.sha)).toEqual(['c']);
  });

  it('borrows forwards when the surplus sits after the empty day', () => {
    const commits = [commit('a', '2026-06-22'), commit('b', '2026-06-22')];
    const result = distribute(commits, ['2026-06-18', '2026-06-22']);
    expect(result.get('2026-06-18')!.map((c) => c.sha)).toEqual(['a']);
    expect(result.get('2026-06-22')!.map((c) => c.sha)).toEqual(['b']);
  });

  it('keeps groups in chronological order', () => {
    const commits = Array.from({ length: 7 }, (_, i) => commit(`c${i}`, '2026-06-18'));
    const dates = ['2026-06-18', '2026-06-19', '2026-06-22'];
    const result = distribute(commits, dates);
    const order = dates.flatMap((d) => result.get(d)!.map((c) => c.sha));
    expect(order).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  });

  it('leaves days empty when there are fewer commits than dates', () => {
    const result = distribute([commit('a', '2026-06-18')], ['2026-06-18', '2026-06-19']);
    expect(result.get('2026-06-18')).toHaveLength(1);
    expect(result.get('2026-06-19')).toHaveLength(0);
  });

  it('pulls commits made on unselected days onto the nearest selected day', () => {
    // Committed on a Sunday that was not an attendance day; Monday is nearer.
    const result = distribute([commit('a', '2026-06-21')], ['2026-06-18', '2026-06-22']);
    expect(result.get('2026-06-22')!.map((c) => c.sha)).toEqual(['a']);
  });

  it('breaks an exact tie in favour of the earlier attended day', () => {
    // Saturday work is equidistant from Thursday and Monday: it lands on Thursday.
    const result = distribute([commit('a', '2026-06-20')], ['2026-06-18', '2026-06-22']);
    expect(result.get('2026-06-18')!.map((c) => c.sha)).toEqual(['a']);
    expect(result.get('2026-06-22')).toEqual([]);
  });

  it('handles no commits and no dates', () => {
    expect(distribute([], ['2026-06-18']).get('2026-06-18')).toEqual([]);
    expect(distribute([commit('a', '2026-06-18')], []).size).toBe(0);
  });
});

describe('toDateKey', () => {
  it('formats a local calendar day', () => {
    expect(toDateKey('2026-06-18T09:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('summarize', () => {
  it('strips conventional-commit prefixes and dedupes', () => {
    const commits = [
      commit('a', '2026-06-18', 'feat(auth): add PBKDF2 hashing'),
      commit('b', '2026-06-18', 'fix: add pbkdf2 hashing'),
      commit('c', '2026-06-18', 'chore: bump deps\n\nlong body here'),
      commit('d', '2026-06-18', 'Merge branch main into dev'),
    ];
    expect(summarize(commits)).toBe('Add PBKDF2 hashing\nBump deps');
  });

  it('returns an empty string when there is nothing to say', () => {
    expect(summarize([])).toBe('');
  });

  it('leaves plain messages alone', () => {
    expect(cleanMessage('migration for Frontline Services table')).toBe(
      'Migration for Frontline Services table',
    );
  });
});
