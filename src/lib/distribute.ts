import type { Commit } from '../types';

/** Local calendar day of a commit, as yyyy-MM-dd. */
export function toDateKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/**
 * Assign commits to the selected attendance dates.
 *
 * Guarantees:
 *  - every commit lands in exactly one date bucket (never duplicated);
 *  - a commit stays on its real commit date whenever that date was selected;
 *  - otherwise it goes to the nearest selected date, so buckets stay contiguous
 *    in chronological order;
 *  - if a selected date ends up empty while there are enough commits to go
 *    around, it borrows from the nearest neighbour that has a surplus, shifting
 *    commits along the chain so chronological order is preserved;
 *  - with fewer commits than dates, the leftover dates simply stay empty.
 */
export function distribute(commits: Commit[], dates: string[]): Map<string, Commit[]> {
  const buckets = new Map<string, Commit[]>();
  dates.forEach((d) => buckets.set(d, []));
  if (dates.length === 0) return buckets;

  const sortedDates = [...dates].sort();
  const dateNums = sortedDates.map(dayNumber);

  const sorted = [...commits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.sha.localeCompare(b.sha),
  );

  // Deduplicate by SHA, then drop the commit on its own date, or the nearest one.
  const seen = new Set<string>();
  const groups: Commit[][] = sortedDates.map(() => []);
  for (const commit of sorted) {
    if (seen.has(commit.sha)) continue;
    seen.add(commit.sha);

    const target = dayNumber(toDateKey(commit.date));
    let best = 0;
    let bestDist = Infinity;
    dateNums.forEach((num, i) => {
      const dist = Math.abs(num - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    groups[best].push(commit);
  }

  // Fill empty days by shifting commits along from the nearest surplus neighbour.
  // Each pass fills one empty day and creates none, so this terminates.
  for (;;) {
    const empty = groups.findIndex((g) => g.length === 0);
    if (empty === -1) break;

    let donor = -1;
    for (let i = empty - 1; i >= 0; i--) {
      if (groups[i].length > 1) {
        donor = i;
        break;
      }
    }
    if (donor !== -1) {
      for (let i = donor; i < empty; i++) groups[i + 1].unshift(groups[i].pop()!);
      continue;
    }

    for (let i = empty + 1; i < groups.length; i++) {
      if (groups[i].length > 1) {
        donor = i;
        break;
      }
    }
    if (donor === -1) break; // not enough commits to cover every day
    for (let i = donor; i > empty; i--) groups[i - 1].push(groups[i].shift()!);
  }

  sortedDates.forEach((d, i) => buckets.set(d, groups[i]));
  return buckets;
}
