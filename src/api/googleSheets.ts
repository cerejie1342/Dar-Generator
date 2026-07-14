import dayjs from 'dayjs';
import type { DayRow, Settings } from '../types';
import { invalidateToken } from './googleAuth';

export class SheetsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'SheetsError';
  }
}

/* ------------------------------------------------------------------ colours */

interface Color {
  red: number;
  green: number;
  blue: number;
}

function hex(value: string): Color {
  const n = parseInt(value.replace('#', ''), 16);
  return {
    red: ((n >> 16) & 255) / 255,
    green: ((n >> 8) & 255) / 255,
    blue: (n & 255) / 255,
  };
}

const C = {
  tan: hex('#FCE4C4'), // info-block labels
  peach: hex('#FBD5B5'), // section + date/weekday headers
  yellow: hex('#FFFF00'), // "DAYS" banner
  darkBlue: hex('#17375E'), // organisation name
  olive: hex('#7F6000'), // address line
  textBlue: hex('#1F4E79'), // field values / accomplishments
  black: hex('#000000'),
};

/* -------------------------------------------------------------------- grid */

interface Fmt {
  bg?: Color;
  bold?: boolean;
  size?: number;
  color?: Color;
  align?: 'LEFT' | 'CENTER' | 'RIGHT';
  valign?: 'TOP' | 'MIDDLE' | 'BOTTOM';
  wrap?: boolean;
  border?: boolean;
}

const BORDER = { style: 'SOLID', width: 1, color: C.black };

function toFormat(f: Fmt) {
  const format: Record<string, unknown> = {
    horizontalAlignment: f.align ?? 'LEFT',
    verticalAlignment: f.valign ?? 'MIDDLE',
    wrapStrategy: f.wrap ? 'WRAP' : 'OVERFLOW_CELL',
    textFormat: {
      fontFamily: 'Arial',
      fontSize: f.size ?? 9,
      bold: !!f.bold,
      foregroundColor: f.color ?? C.black,
    },
  };
  if (f.bg) format.backgroundColor = f.bg;
  if (f.border) format.borders = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  return format;
}

interface Merge {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

class Grid {
  private cells = new Map<string, { value?: string; fmt: Fmt }>();
  readonly merges: Merge[] = [];
  maxRow = 0;

  constructor(readonly cols: number) {}

  private at(row: number, col: number) {
    const key = `${row}:${col}`;
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { fmt: {} };
      this.cells.set(key, cell);
    }
    this.maxRow = Math.max(this.maxRow, row);
    return cell;
  }

  /** Apply a format across a rectangle (inclusive bounds). */
  style(r1: number, c1: number, r2: number, c2: number, fmt: Fmt): void {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = this.at(r, c);
        cell.fmt = { ...cell.fmt, ...fmt };
      }
    }
  }

  put(row: number, col: number, value: string, fmt: Fmt = {}): void {
    const cell = this.at(row, col);
    cell.value = value;
    cell.fmt = { ...cell.fmt, ...fmt };
  }

  /** Merge a rectangle, style all of it, and write the value in the top-left. */
  block(r1: number, c1: number, r2: number, c2: number, value: string, fmt: Fmt = {}): void {
    this.style(r1, c1, r2, c2, fmt);
    if (value) this.put(r1, c1, value, fmt);
    if (r1 !== r2 || c1 !== c2) {
      this.merges.push({
        startRowIndex: r1,
        endRowIndex: r2 + 1,
        startColumnIndex: c1,
        endColumnIndex: c2 + 1,
      });
    }
  }

  toRowData() {
    const rows = [];
    for (let r = 0; r <= this.maxRow; r++) {
      const values = [];
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells.get(`${r}:${c}`);
        if (!cell) {
          values.push({});
          continue;
        }
        const data: Record<string, unknown> = { userEnteredFormat: toFormat(cell.fmt) };
        if (cell.value !== undefined) {
          data.userEnteredValue = cell.value.startsWith('=')
            ? { formulaValue: cell.value }
            : { stringValue: cell.value };
        }
        values.push(data);
      }
      rows.push({ values });
    }
    return rows;
  }
}

/* ------------------------------------------------------------------ layout */

const COL_NUM = 0;
const COL_DUTY = 1;
const COL_MFO = 2;
const FIRST_DAY = 3;

export interface DarMeta {
  periodCovered: string;
  dateSubmitted: string;
  daysAttended: number;
}

export function periodCovered(dates: string[]): string {
  if (dates.length === 0) return '';
  const first = dayjs(dates[0]);
  const last = dayjs(dates[dates.length - 1]);
  return `${first.format('MMMM D')} - ${last.format('MMMM D YYYY')}`;
}

/**
 * Build the whole DAR sheet: a cell grid, its merges, column widths and row
 * heights, sized to however many attendance dates were picked.
 */
export function buildDarRequests(
  settings: Settings,
  dayRows: DayRow[],
  meta: DarMeta,
  sheetId: number,
): { requests: unknown[]; rowCount: number; columnCount: number } {
  const n = dayRows.length;
  const totalCols = FIRST_DAY + n;
  const lastCol = totalCols - 1;
  const lastDay = FIRST_DAY + n - 1;
  const grid = new Grid(totalCols);

  /* ---- title block
     The title lines are centred across the full sheet width, leaving rows 1-6 free
     for a logo the user drops in by hand (the API can't place a floating image —
     that exists only in the UI and Apps Script).

     These merges span every column, so the sheet cannot be frozen: Sheets refuses a
     freeze line that cuts through a merged cell. */
  grid.block(1, COL_NUM, 1, lastCol, settings.orgName, {
    bold: true,
    size: 12,
    color: C.darkBlue,
    align: 'CENTER',
  });
  grid.block(2, COL_NUM, 2, lastCol, settings.orgAddress, {
    bold: true,
    size: 10,
    color: C.olive,
    align: 'CENTER',
  });
  grid.block(4, COL_NUM, 4, lastCol, settings.reportTitle, {
    bold: true,
    size: 10,
    align: 'CENTER',
  });

  /* ---- info block */
  const infoStart = 7;
  const infoFields: [string, string][] = [
    ['Name of PBE', settings.pbeName],
    ['Position Title', settings.positionTitle],
    ['Department', settings.department],
    ['Unit', settings.unit],
    ['Immediate Supervisor', settings.supervisor],
    ['Period Covered', meta.periodCovered],
  ];

  // Value box spans C:E only — wide enough for the longest field (Unit) without
  // running under the right-hand "Date Submitted" block.
  const sideBySide = totalCols >= 8;
  const valueEnd = sideBySide ? Math.min(COL_MFO + 2, lastCol) : lastCol;

  infoFields.forEach(([label, value], i) => {
    const row = infoStart + i;
    grid.block(row, COL_NUM, row, COL_DUTY, label, {
      bg: C.tan,
      bold: true,
      border: true,
      color: C.black,
    });
    grid.block(row, COL_MFO, row, valueEnd, value, {
      bold: true,
      border: true,
      color: C.textBlue,
    });
  });

  const rightFields: [string, string][] = [
    ['Date Submitted :', meta.dateSubmitted],
    ['Actual No. of Days Attended :', String(meta.daysAttended)],
  ];

  if (sideBySide) {
    rightFields.forEach(([label, value], i) => {
      const row = infoStart + i;
      grid.block(row, lastCol - 2, row, lastCol - 1, label, { bold: true });
      grid.block(row, lastCol, row, lastCol, value, {
        bold: true,
        align: 'CENTER',
        color: C.textBlue,
        border: true,
      });
    });
  } else {
    rightFields.forEach(([label, value], i) => {
      const row = infoStart + infoFields.length + i;
      grid.block(row, COL_NUM, row, COL_DUTY, label, { bg: C.tan, bold: true, border: true });
      grid.block(row, COL_MFO, row, lastCol, value, { bold: true, border: true, color: C.textBlue });
    });
  }
  const infoRows = infoFields.length + (sideBySide ? 0 : rightFields.length);

  /* ---- DAYS banner + numbering */
  const tableTop = infoStart + infoRows + 1;
  grid.block(
    tableTop,
    COL_NUM,
    tableTop + 1,
    COL_MFO,
    'SPECIFIC DUTIES AND RESPONSIBILITIES:\n     Please indicate the actual accomplishment',
    { bold: true, wrap: true, valign: 'MIDDLE' },
  );
  grid.block(tableTop, FIRST_DAY, tableTop, lastDay, 'DAYS', {
    bg: C.yellow,
    bold: true,
    align: 'CENTER',
    border: true,
  });
  dayRows.forEach((_, i) => {
    grid.put(tableTop + 1, FIRST_DAY + i, String(i + 1), {
      bold: true,
      align: 'CENTER',
      border: true,
    });
  });

  /** Date + weekday header pair, repeated above each section. */
  const dateHeaders = (row: number) => {
    dayRows.forEach((day, i) => {
      const d = dayjs(day.date);
      grid.put(row, FIRST_DAY + i, d.format('DD-MMM'), {
        bg: C.peach,
        bold: true,
        align: 'CENTER',
        border: true,
      });
      grid.put(row + 1, FIRST_DAY + i, d.format('ddd').toUpperCase(), {
        bg: C.peach,
        bold: true,
        align: 'CENTER',
        border: true,
      });
    });
  };

  /* ---- A.) Core functions */
  const coreHeader = tableTop + 2;
  grid.block(coreHeader, COL_NUM, coreHeader + 1, COL_DUTY, 'A.) CORE FUNCTIONS', {
    bg: C.peach,
    bold: true,
    align: 'CENTER',
    border: true,
  });
  grid.block(coreHeader, COL_MFO, coreHeader + 1, COL_MFO, 'MAJOR FINAL OUTPUT (MFOs)', {
    bg: C.peach,
    bold: true,
    align: 'CENTER',
    border: true,
    wrap: true,
  });
  dateHeaders(coreHeader);

  const coreRow = coreHeader + 2;
  grid.put(coreRow, COL_NUM, '1', { align: 'CENTER', valign: 'MIDDLE', border: true });
  grid.put(coreRow, COL_DUTY, settings.coreDuty, {
    wrap: true,
    valign: 'MIDDLE',
    border: true,
    color: C.textBlue,
  });
  grid.put(coreRow, COL_MFO, settings.coreMfo, {
    wrap: true,
    valign: 'TOP',
    border: true,
    color: C.textBlue,
  });
  dayRows.forEach((day, i) => {
    grid.put(coreRow, FIRST_DAY + i, day.accomplishment, {
      wrap: true,
      valign: 'TOP',
      border: true,
      color: C.textBlue,
    });
  });

  /* ---- B.) Support functions */
  const supportHeader = coreRow + 1;
  grid.block(supportHeader, COL_NUM, supportHeader + 1, COL_DUTY, 'B.) SUPPORT FUNCTIONS', {
    bg: C.peach,
    bold: true,
    align: 'CENTER',
    border: true,
  });
  grid.block(supportHeader, COL_MFO, supportHeader + 1, COL_MFO, 'MINOR FINAL OUTPUT (MFOs)', {
    bg: C.peach,
    bold: true,
    align: 'CENTER',
    border: true,
    wrap: true,
  });
  dateHeaders(supportHeader);

  let row = supportHeader + 2;
  const supportRowIndexes: number[] = [];
  settings.supportFunctions.forEach((fn, i) => {
    const mfos = fn.mfos.length ? fn.mfos : [''];
    const top = row;
    const bottom = row + mfos.length - 1;

    grid.block(top, COL_NUM, bottom, COL_NUM, String(settings.supportStartNumber + i), {
      align: 'CENTER',
      valign: 'MIDDLE',
      border: true,
    });
    grid.block(top, COL_DUTY, bottom, COL_DUTY, fn.name, {
      wrap: true,
      valign: 'MIDDLE',
      border: true,
      color: C.textBlue,
    });

    mfos.forEach((mfo, j) => {
      const r = top + j;
      supportRowIndexes.push(r);
      grid.put(r, COL_MFO, mfo, { wrap: true, valign: 'MIDDLE', border: true, color: C.textBlue });
      for (let c = FIRST_DAY; c <= lastDay; c++) {
        grid.style(r, c, r, c, { border: true, wrap: true, valign: 'TOP' });
      }
    });
    row = bottom + 1;
  });

  /* ---- signatories */
  const footerLabel = row + 2;
  const footerName = footerLabel + 3;
  const footerTitle = footerName + 1;
  const signatories: [string, { name: string; title: string }][] = [
    ['Prepared by:', settings.preparedBy],
    ['Confirmed by:', settings.confirmedBy],
    ['Noted by:', settings.notedBy],
  ];

  if (sideBySide) {
    const cols = [COL_DUTY, FIRST_DAY, Math.min(FIRST_DAY + 3, lastCol)];
    signatories.forEach(([label, who], i) => {
      const col = cols[i];
      grid.put(footerLabel, col, label, { bold: true });
      grid.put(footerName, col, who.name.toUpperCase(), { bold: true });
      grid.put(footerTitle, col, who.title, { color: C.textBlue });
    });
  } else {
    signatories.forEach(([label, who], i) => {
      const base = footerLabel + i * 4;
      grid.put(base, COL_DUTY, label, { bold: true });
      grid.put(base + 2, COL_DUTY, who.name.toUpperCase(), { bold: true });
      grid.put(base + 3, COL_DUTY, who.title, { color: C.textBlue });
    });
  }

  /* ---- dimensions */
  const dim = (start: number, end: number, pixelSize: number, dimension: 'ROWS' | 'COLUMNS') => ({
    updateDimensionProperties: {
      range: { sheetId, dimension, startIndex: start, endIndex: end },
      properties: { pixelSize },
      fields: 'pixelSize',
    },
  });

  const requests: unknown[] = [
    {
      updateCells: {
        rows: grid.toRowData(),
        fields: 'userEnteredValue,userEnteredFormat',
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
      },
    },
    ...grid.merges.map((m) => ({ mergeCells: { range: { sheetId, ...m }, mergeType: 'MERGE_ALL' } })),
    dim(COL_NUM, COL_NUM + 1, 32, 'COLUMNS'),
    dim(COL_DUTY, COL_DUTY + 1, 250, 'COLUMNS'),
    dim(COL_MFO, COL_MFO + 1, 190, 'COLUMNS'),
    dim(FIRST_DAY, totalCols, 110, 'COLUMNS'),
    dim(coreRow, coreRow + 1, 180, 'ROWS'),
    dim(1, 6, 22, 'ROWS'),
  ];

  for (const r of supportRowIndexes) requests.push(dim(r, r + 1, 56, 'ROWS'));

  return { requests, rowCount: grid.maxRow + 6, columnCount: totalCols };
}

/* ---------------------------------------------------------------- API calls */

async function sheetsFetch(url: string, token: string, body?: unknown) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    invalidateToken();
    throw new SheetsError('Your Google session expired. Sign in again to continue.', 401);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json())?.error?.message ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new SheetsError(`Google Sheets API error (${res.status}): ${detail}`, res.status);
  }
  return res.json();
}

/**
 * Create a brand-new spreadsheet in the user's Drive and paint the DAR onto it.
 * Returns the spreadsheet URL.
 */
export async function createDarSpreadsheet(
  token: string,
  title: string,
  settings: Settings,
  dayRows: DayRow[],
  meta: DarMeta,
): Promise<{ url: string; spreadsheetId: string }> {
  const created = await sheetsFetch('https://sheets.googleapis.com/v4/spreadsheets', token, {
    properties: { title },
    sheets: [{ properties: { title: 'DAR', gridProperties: { rowCount: 60, columnCount: 30 } } }],
  });

  const spreadsheetId: string = created.spreadsheetId;
  const sheetId: number = created.sheets[0].properties.sheetId;

  const { requests, rowCount, columnCount } = buildDarRequests(settings, dayRows, meta, sheetId);

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    token,
    {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { rowCount, columnCount } },
            fields: 'gridProperties.rowCount,gridProperties.columnCount',
          },
        },
        ...requests,
      ],
    },
  );

  return { url: created.spreadsheetUrl, spreadsheetId };
}
