import * as XLSX from 'xlsx';

import { deliverWorkbook, movementsSheet, type MovementRow } from './export-excel';
import { formatDateTime, roundQuantity } from './format';

const PURCHASE_HEADERS = [
  'Fecha',
  'Proveedor',
  'Categoría',
  'Ítem',
  'Cantidad',
  'Precio unitario ($)',
  'Total ($)',
  'Responsable',
  'Notas',
];

const PURCHASE_WIDTHS = [18, 24, 32, 22, 10, 18, 14, 20, 32];

/**
 * Excel para el balance del contador, con dos hojas:
 * "Compras" con precios y total, y "Movimientos" con todo el historial.
 * Los importes van como números para que se puedan sumar en Excel.
 */
export function exportAccountingExcel(movements: MovementRow[], filename: string) {
  const purchases = movements.filter((movement) => movement.action === 'compra');
  let total = 0;

  const rows = purchases.map((purchase) => {
    const purchaseTotal =
      purchase.totalCost ??
      (purchase.unitCost != null ? roundQuantity(purchase.unitCost * purchase.quantity) : null);
    total += purchaseTotal ?? 0;
    return [
      formatDateTime(purchase.timestamp as never),
      purchase.supplier || 'No especificado',
      purchase.path.slice(0, -1).join(' > '),
      purchase.path[purchase.path.length - 1] ?? '',
      purchase.quantity,
      purchase.unitCost ?? null,
      purchaseTotal,
      purchase.userName || 'Desconocido',
      purchase.notes ?? '',
    ];
  });

  const purchasesSheet = XLSX.utils.aoa_to_sheet([
    PURCHASE_HEADERS,
    ...rows,
    [],
    ['', '', '', '', '', 'TOTAL COMPRAS', roundQuantity(total)],
  ]);
  purchasesSheet['!cols'] = PURCHASE_WIDTHS.map((wch) => ({ wch }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, purchasesSheet, 'Compras');
  XLSX.utils.book_append_sheet(workbook, movementsSheet(movements), 'Movimientos');
  return deliverWorkbook(workbook, filename);
}
