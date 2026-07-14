
import dayjs from 'dayjs';
import type { DayRow, Settings } from '../types';

interface DarMeta {
  periodCovered: string;
  dateSubmitted: string;
  daysAttended: number;
}

const COLORS = {
  tan: 'FCE4C4',
  peach: 'FBD5B5',
  yellow: 'FFFF00',
  darkBlue: '17375E',
  olive: '7F6000',
  textBlue: '1F4E79',
  black: '000000',
};

export async function exportToExcel(
  filename: string,
  settings: Settings,
  dayRows: DayRow[],
  meta: DarMeta,
): Promise<void> {

  const totalCols = Math.max(12, dayRows.length + 2);
  worksheet.columns = Array(totalCols).fill(null).map((_, i) => ({ key: `col${i}`, width: 12 }));

  const COL_NUM = 0;
  const COL_DUTY = 1;
  const COL_MFO = 2;
  const FIRST_DAY = 3;
  const lastCol = totalCols - 1;

  // Helper to add/format cells
  const cell = (row: number, col: number, value?: string) => {
    const c = worksheet.getCell(row, col + 1);
    if (value !== undefined) c.value = value;
    return c;
  };

  // Organisation header
  cell(1, COL_NUM, settings.orgName).font = { bold: true, size: 12, color: { argb: COLORS.darkBlue } };
  cell(2, COL_NUM, settings.orgAddress).font = { size: 10, color: { argb: COLORS.olive } };
  cell(4, COL_NUM, settings.reportTitle).font = { bold: true, size: 10 };

  // Info block
  const infoStart = 7;
  const infoFields: [string, string][] = [
    ['Name of PBE', settings.pbeName],
    ['Position Title', settings.positionTitle],
    ['Department', settings.department],
    ['Unit', settings.unit],
    ['Immediate Supervisor', settings.supervisor],
    ['Period Covered', meta.periodCovered],
  ];

  const sideBySide = totalCols >= 8;

  infoFields.forEach(([label, value], i) => {
    const row = infoStart + i;
    const labelCell = cell(row, COL_NUM, label);
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.tan } };
    labelCell.font = { bold: true };
    labelCell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };

    const valueCell = cell(row, COL_MFO, value);
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.tan } };
    valueCell.font = { bold: true, color: { argb: COLORS.textBlue } };
    valueCell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  const rightFields: [string, string][] = [
    ['Date Submitted :', meta.dateSubmitted],
    ['Actual No. of Days Attended :', String(meta.daysAttended)],
  ];

  if (sideBySide) {
    rightFields.forEach(([label, value], i) => {
      const row = infoStart + i;
      cell(row, lastCol - 2, label).font = { bold: true };
      const valueCell = cell(row, lastCol, value);
      valueCell.font = { bold: true, color: { argb: COLORS.textBlue } };
      valueCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  }

  // Days banner
  const tableTop = infoStart + infoFields.length + 1;
  const dutyCell = cell(tableTop, COL_NUM, 'SPECIFIC DUTIES AND RESPONSIBILITIES:\n     Please indicate the actual accomplishment');
  dutyCell.alignment = { wrapText: true, vertical: 'middle' };

  for (let i = 0; i < dayRows.length; i++) {
    const dayCell = cell(tableTop, FIRST_DAY + i, '');
    dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.yellow } };
    dayCell.font = { bold: true };
    dayCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  }

  // Day numbers
  dayRows.forEach((_, i) => {
    const numCell = cell(tableTop + 1, FIRST_DAY + i, String(i + 1));
    numCell.font = { bold: true };
    numCell.alignment = { horizontal: 'center' };
    numCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Date headers
  const dateRow = tableTop + 2;
  dayRows.forEach((day, i) => {
    const d = dayjs(day.date);
    const dateCell = cell(dateRow, FIRST_DAY + i, d.format('DD-MMM'));
    dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.peach } };
    dateCell.font = { bold: true };
    dateCell.alignment = { horizontal: 'center' };
    dateCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    const weekdayCell = cell(dateRow + 1, FIRST_DAY + i, d.format('ddd'));
    weekdayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.peach } };
    weekdayCell.font = { bold: true };
    weekdayCell.alignment = { horizontal: 'center' };
    weekdayCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Core duty
  const coreRow = dateRow + 2;
  const coreLabel = cell(coreRow, COL_NUM, 'A.');
  coreLabel.font = { bold: true };
  const coreName = cell(coreRow, COL_DUTY, settings.coreDuty);
  coreName.alignment = { wrapText: true };

  // Accomplishments
  const accomplishmentRow = coreRow + 1;
  dayRows.forEach((day, i) => {
    const accCell = cell(accomplishmentRow, FIRST_DAY + i, day.accomplishment);
    accCell.alignment = { wrapText: true, vertical: 'top' };
    accCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Support functions
  let currentRow = accomplishmentRow + settings.supportFunctions.length + 1;
  settings.supportFunctions.forEach((fn, fnIndex) => {
    const fnLabel = cell(currentRow, COL_NUM, `B.${fnIndex + 1}`);
    fnLabel.font = { bold: true };
    const fnName = cell(currentRow, COL_DUTY, fn.name);
    fnName.alignment = { wrapText: true };

    fn.mfos.forEach((mfo, mfoIndex) => {
      const mfoRow = currentRow + mfoIndex + 1;
      const mfoCell = cell(mfoRow, COL_DUTY, mfo);
      mfoCell.alignment = { wrapText: true };
    });

    currentRow += fn.mfos.length + 2;
  });

  // Set row heights
  worksheet.getRow(1).height = 20;
  worksheet.getRow(tableTop).height = 30;

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
