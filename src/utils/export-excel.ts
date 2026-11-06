import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import { formatDateTime } from './format';

export interface MovementRow {
  timestamp: unknown;
  userName: string;
  path: string[];
  action: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  notes: string;
  unitCost?: number | null;
  totalCost?: number | null;
  supplier?: string | null;
}

export const ACTION_LABELS: Record<string, string> = {
  retirar: 'Egreso',
  devolver: 'Devolución',
  compra: 'Compra',
};

type Cell = string | number | null;

const MOVEMENT_COLUMNS: { header: string; width: number; value: (row: MovementRow) => Cell }[] = [
  { header: 'Fecha', width: 18, value: (row) => formatDateTime(row.timestamp as never) },
  { header: 'Usuario', width: 20, value: (row) => row.userName || 'Desconocido' },
  { header: 'Categoría', width: 32, value: (row) => row.path.slice(0, -1).join(' > ') },
  { header: 'Ítem', width: 22, value: (row) => row.path[row.path.length - 1] ?? '' },
  { header: 'Tipo', width: 12, value: (row) => ACTION_LABELS[row.action] ?? row.action },
  { header: 'Cantidad', width: 10, value: (row) => row.quantity },
  { header: 'Stock antes', width: 12, value: (row) => row.stockBefore },
  { header: 'Stock después', width: 14, value: (row) => row.stockAfter },
  { header: 'Precio unit. ($)', width: 16, value: (row) => row.unitCost ?? null },
  { header: 'Total ($)', width: 14, value: (row) => row.totalCost ?? null },
  { header: 'Proveedor', width: 22, value: (row) => row.supplier ?? '' },
  { header: 'Notas', width: 32, value: (row) => row.notes ?? '' },
];

export function movementsSheet(rows: MovementRow[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    MOVEMENT_COLUMNS.map((column) => column.header),
    ...rows.map((row) => MOVEMENT_COLUMNS.map((column) => column.value(row))),
  ]);
  sheet['!cols'] = MOVEMENT_COLUMNS.map((column) => ({ wch: column.width }));
  return sheet;
}

/** En web descarga el archivo; en el teléfono devuelve el base64 para compartirlo. */
export function deliverWorkbook(workbook: XLSX.WorkBook, filename: string): string | undefined {
  if (Platform.OS === 'web') {
    XLSX.writeFile(workbook, filename);
    return undefined;
  }
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

export const exportFilename = (prefix: string) =>
  `${prefix}_andpatelec_${new Date().toISOString().split('T')[0]}.xlsx`;

export function exportMovementsToExcel(rows: MovementRow[], filename: string) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, movementsSheet(rows), 'Historial');
  return deliverWorkbook(workbook, filename);
}
