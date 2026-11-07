import * as XLSX from 'xlsx';

import type { CatalogItem } from '@/context/catalog-context';

import { deliverWorkbook } from './export-excel';
import { LOW_STOCK_THRESHOLD, roundQuantity } from './format';
import { getUnit } from './units';

const COLUMNS: { header: string; width: number; value: (item: CatalogItem) => string | number | null }[] = [
  { header: 'Categoría', width: 40, value: (item) => item.path.slice(0, -1).join(' > ') },
  { header: 'Ítem', width: 26, value: (item) => item.name },
  { header: 'Código', width: 14, value: (item) => item.code ?? '' },
  { header: 'Stock', width: 10, value: (item) => item.stock },
  { header: 'Unidad', width: 10, value: (item) => getUnit(item.unitOfMeasure).short },
  { header: 'Mínimo', width: 10, value: (item) => item.minStock ?? LOW_STOCK_THRESHOLD },
  { header: 'Último precio ($)', width: 16, value: (item) => item.unitCost || null },
  {
    header: 'Valor ($)',
    width: 14,
    value: (item) => (item.unitCost ? roundQuantity(item.unitCost * item.stock) : null),
  },
];

/**
 * Planilla de stock. La misma sirve para contar: se completa la columna Stock y se importa
 * desde Administración › Conteo.
 */
export function exportStockExcel(items: CatalogItem[], filename: string, sheetName = 'Stock') {
  const sheet = XLSX.utils.aoa_to_sheet([
    COLUMNS.map((column) => column.header),
    ...items.map((item) => COLUMNS.map((column) => column.value(item))),
  ]);
  sheet['!cols'] = COLUMNS.map((column) => ({ wch: column.width }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return deliverWorkbook(workbook, filename);
}
