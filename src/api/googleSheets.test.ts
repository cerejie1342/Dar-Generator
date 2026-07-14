import { describe, expect, it } from 'vitest';
import { buildDarRequests } from './googleSheets';
import { DEFAULT_SETTINGS } from '../lib/storage';
import type { DayRow } from '../types';

const days = (n: number): DayRow[] =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    commits: [],
    accomplishment: `work ${i + 1}`,
  }));

const meta = { periodCovered: 'July 1 - July 10 2026', dateSubmitted: '2026-07-15', daysAttended: 5 };

interface Merge {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

const overlaps = (a: Merge, b: Merge) =>
  a.startRowIndex < b.endRowIndex &&
  b.startRowIndex < a.endRowIndex &&
  a.startColumnIndex < b.endColumnIndex &&
  b.startColumnIndex < a.endColumnIndex;

function mergesOf(requests: unknown[]): Merge[] {
  return requests
    .map((r) => (r as { mergeCells?: { range: Merge } }).mergeCells?.range)
    .filter((r): r is Merge => !!r);
}

function frozenColumns(requests: unknown[]): number | null {
  const req = requests.find(
    (r) =>
      (r as { updateSheetProperties?: { fields: string } }).updateSheetProperties?.fields ===
      'gridProperties.frozenColumnCount',
  ) as
    | { updateSheetProperties: { properties: { gridProperties: { frozenColumnCount: number } } } }
    | undefined;
  return req?.updateSheetProperties.properties.gridProperties.frozenColumnCount ?? null;
}

describe('buildDarRequests', () => {
  // The header merges span the full width, so the sheet must not be frozen:
  // Sheets rejects a freeze that splits a merged cell ("you can't freeze columns
  // which contain only part of a merged cell") and the whole batch fails.
  it.each([1, 2, 3, 5, 6, 10, 22])('never freezes through a merged cell (%i days)', (n) => {
    const { requests } = buildDarRequests(DEFAULT_SETTINGS, days(n), meta, 0);
    const freeze = frozenColumns(requests);
    if (freeze === null) return;

    const straddling = mergesOf(requests).filter(
      (m) => m.startColumnIndex < freeze && m.endColumnIndex > freeze,
    );
    expect(straddling).toEqual([]);
  });

  // Sheets rejects the whole batch with "you can't merge overlapping ranges" if any
  // two merges intersect — the full-width title merges make this easy to trip.
  it.each([1, 2, 3, 5, 6, 10, 22])('never overlaps two merges (%i days)', (n) => {
    const merges = mergesOf(buildDarRequests(DEFAULT_SETTINGS, days(n), meta, 0).requests);

    const collisions = merges.flatMap((a, i) =>
      merges.slice(i + 1).filter((b) => overlaps(a, b)),
    );
    expect(collisions).toEqual([]);
  });

  // The info values (Name of PBE ... Period Covered) must stop at column E rather
  // than stretching toward the "Date Submitted" block on the right.
  it.each([5, 6, 9, 10, 22])('ends the info value merges at column E (%i days)', (n) => {
    const { requests } = buildDarRequests(DEFAULT_SETTINGS, days(n), meta, 0);

    // Six info rows, each merging the value cell across C..E (indexes 2..4).
    const infoValues = mergesOf(requests).filter(
      (m) => m.startColumnIndex === 2 && m.endRowIndex === m.startRowIndex + 1,
    );

    expect(infoValues).toHaveLength(6);
    for (const m of infoValues) expect(m.endColumnIndex).toBe(5);
  });

  it.each([1, 2, 3, 5, 6, 10, 22])('keeps every merge inside the sheet (%i days)', (n) => {
    const { requests, columnCount } = buildDarRequests(DEFAULT_SETTINGS, days(n), meta, 0);
    const merges = mergesOf(requests);

    expect(merges.length).toBeGreaterThan(0);
    for (const m of merges) {
      expect(m.startColumnIndex).toBeLessThan(m.endColumnIndex);
      expect(m.endColumnIndex).toBeLessThanOrEqual(columnCount);
    }
  });
});
