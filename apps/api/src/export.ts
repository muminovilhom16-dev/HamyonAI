import ExcelJS from 'exceljs';
import type { ExportRow, Language } from '@hamyon/core';

const HEADERS: Record<Language, string[]> = {
  // TZ §31 columns, then UZS value and counterparty for convenience.
  uz_latn: ['sana', 'tur', 'summa', 'valyuta', 'kategoriya', 'izoh', 'kim kiritgan', "summa (so'm)", 'kim bilan'],
  uz_cyrl: ['сана', 'тур', 'сумма', 'валюта', 'категория', 'изоҳ', 'ким киритган', 'сумма (сўм)', 'ким билан'],
  ru: ['дата', 'тип', 'сумма', 'валюта', 'категория', 'комментарий', 'кто внёс', 'сумма (сум)', 'с кем'],
};

const TYPES: Record<Language, Record<ExportRow['type'], string>> = {
  uz_latn: { expense: 'xarajat', income: 'daromad', debt_given: 'qarz berildi', debt_taken: 'qarz olindi', debt_return: 'qarz qaytarildi' },
  uz_cyrl: { expense: 'харажат', income: 'даромад', debt_given: 'қарз берилди', debt_taken: 'қарз олинди', debt_return: 'қарз қайтарилди' },
  ru: { expense: 'расход', income: 'доход', debt_given: 'дал в долг', debt_taken: 'взял в долг', debt_return: 'возврат долга' },
};

function cells(r: ExportRow, lang: Language): Array<string | number> {
  return [`${r.date} ${r.time}`, TYPES[lang][r.type], r.amount, r.currency, r.category ?? '', r.note ?? '', r.enteredBy ?? '', r.amountUzs, r.counterparty ?? ''];
}

/** Spreadsheet apps execute cells starting with = + - @ (CSV injection). */
const neutralize = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function renderCsv(rows: ExportRow[], lang: Language): Buffer {
  const esc = (v: string | number) => {
    if (typeof v === 'number') return String(v);
    const s = neutralize(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [HEADERS[lang], ...rows.map((r) => cells(r, lang))].map((row) => row.map(esc).join(','));
  // BOM so Excel opens UTF-8 (Cyrillic, o‘) correctly.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function renderXlsx(rows: ExportRow[], lang: Language): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hamyon AI';
  const ws = wb.addWorksheet('Hamyon AI');
  ws.addRow(HEADERS[lang]).font = { bold: true };
  for (const r of rows) {
    ws.addRow(cells(r, lang).map((v) => (typeof v === 'string' ? neutralize(v) : v)));
  }
  ws.getColumn(3).numFmt = '#,##0';
  ws.getColumn(8).numFmt = '#,##0';
  ws.columns.forEach((c, i) => { c.width = [18, 16, 14, 8, 22, 28, 18, 16, 18][i] ?? 14; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
