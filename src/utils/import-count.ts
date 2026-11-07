import * as XLSX from 'xlsx';

import { parseNumber } from './format';
import { readWorkbook } from './read-workbook';

export interface CountEntry {
  path: string[];
  counted: number;
}

export interface CountImport {
  entries: CountEntry[];
  errors: string[];
}

const cellText = (cell: unknown) =>
  typeof cell === 'number' ? String(cell).replace('.', ',') : String(cell ?? '').trim();

/**
 * Lee un conteo desde la planilla de stock actual: usa las columnas Categoría, Ítem y Stock.
 * Una fila con Stock vacío no se contó y se ignora.
 */
export function parseCountExcel(data: string | ArrayBuffer, isBase64 = false): CountImport {
  let rows: unknown[][];
  try {
    const workbook = readWorkbook(data, isBase64);
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : error;
    return { entries: [], errors: [`No se pudo leer el archivo: ${detail}`] };
  }

  const headers = Array.from(rows[0] ?? [], cellText);
  const category = headers.indexOf('Categoría');
  const item = headers.indexOf('Ítem');
  const stock = headers.indexOf('Stock');
  if (category < 0 || item < 0 || stock < 0) {
    return { entries: [], errors: ['La planilla necesita las columnas Categoría, Ítem y Stock.'] };
  }

  const entries: CountEntry[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((row, index) => {
    const name = cellText(row[item]);
    const raw = row[stock];
    if (!name || raw === undefined || raw === '') return;

    const counted = typeof raw === 'number' ? raw : parseNumber(String(raw));
    if (counted === null || counted < 0) {
      errors.push(`Fila ${index + 2}: "${String(raw)}" no es una cantidad.`);
      return;
    }
    const folders = cellText(row[category]).split(' > ').filter(Boolean);
    entries.push({ path: [...folders, name], counted });
  });

  return { entries, errors };
}
