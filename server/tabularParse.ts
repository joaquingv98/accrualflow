import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

/**
 * TODO: support more Excel layouts (multiple sheets, merged cells, pivots, inconsistent headers).
 */

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Minimal CSV parsing with quoted fields (RFC-lite). */
export function parseCsvBuffer(buf: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const text = stripBom(buf.toString('utf8'));
  const rowsRaw = splitCsvRecords(text);
  if (!rowsRaw.length) return { headers: [], rows: [] };
  const headers = rowsRaw[0].map((h, i) => h.trim() || `col_${i + 1}`);
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rowsRaw.length; r++) {
    const cells = rowsRaw[r];
    if (!cells.some((c) => c.trim().length > 0)) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    rows.push(obj);
  }
  return { headers, rows };
}

function splitCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      field = '';
      records.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.some((c) => c.trim().length > 0)) records.push(row);
  return records;
}

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object' && v !== null) {
    if ('text' in v && typeof (v as { text?: string }).text === 'string') return (v as { text: string }).text;
    if ('richText' in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((x) => x.text).join('');
    }
    if ('result' in v) {
      const r = (v as { result?: unknown }).result;
      if (r != null && (typeof r === 'number' || typeof r === 'string' || typeof r === 'boolean'))
        return String(r);
    }
  }
  return String(v);
}

export async function parseExcelBuffer(buf: Buffer): Promise<{
  headers: string[];
  rows: Record<string, string>[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.read(Readable.from(buf));
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  let maxCol = 0;
  ws.eachRow((row) => {
    maxCol = Math.max(maxCol, row.actualCellCount);
  });
  if (maxCol <= 0) return { headers: [], rows: [] };

  const hRow = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= maxCol; c++) {
    const h = cellToString(hRow.getCell(c)).trim();
    headers.push(h || `col_${c}`);
  }

  const rows: Record<string, string>[] = [];
  ws.eachRow((excelRow, rowNumber) => {
    if (rowNumber <= 1) return;
    const obj: Record<string, string> = {};
    let any = false;
    for (let c = 1; c <= maxCol; c++) {
      const h = headers[c - 1];
      const v = cellToString(excelRow.getCell(c)).trim();
      obj[h] = v;
      if (v) any = true;
    }
    if (any) rows.push(obj);
  });

  return { headers, rows };
}

export async function parseTabularFile(
  buf: Buffer,
  originalName: string,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const lower = originalName.toLowerCase();
  if (lower.endsWith('.csv')) return parseCsvBuffer(buf);
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) return parseExcelBuffer(buf);
  throw new Error(`Unsupported spreadsheet type: ${originalName}. Use .csv, .xlsx or .xlsm.`);
}
