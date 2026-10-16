import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import { formatDate, getActionLabel, MovementRow } from './export-excel';

/**
 * Exports an accounting-ready Excel file with 2 sheets:
 * - "Compras": Only purchase movements with pricing details
 * - "Movimientos": Complete history of all movements
 *
 * Designed for the accountant's year-end balance.
 */
export function exportAccountingExcel(
  movements: MovementRow[],
  filename?: string
): string | void {
  const defaultFilename = `contable_andpatelec_${new Date().toISOString().split('T')[0]}.xlsx`;
  const finalFilename = filename || defaultFilename;

  const wb = XLSX.utils.book_new();

  // ============================================
  // Sheet 1: Compras (purchases only)
  // ============================================
  const purchaseMovements = movements.filter((m) => m.action === 'compra');

  const purchaseHeaders = [
    'Fecha',
    'Proveedor',
    'Categoría',
    'Ítem',
    'Cantidad',
    'Precio Unitario ($)',
    'Total ($)',
    'Responsable',
    'Notas',
  ];

  const purchaseData: string[][] = [purchaseHeaders];
  let grandTotal = 0;

  for (const mov of purchaseMovements) {
    const category = mov.path.slice(0, -1).join(' > ');
    const item = mov.path[mov.path.length - 1] || '';
    const unitCost = mov.unitCost ?? 0;
    const totalCost = mov.totalCost ?? unitCost * mov.quantity;
    grandTotal += totalCost;

    purchaseData.push([
      formatDate(mov.timestamp),
      mov.supplier || 'No especificado',
      category,
      item,
      String(mov.quantity),
      unitCost > 0 ? String(unitCost) : 'No registrado',
      totalCost > 0 ? String(totalCost) : 'No registrado',
      mov.userName || 'Desconocido',
      mov.notes || '',
    ]);
  }

  // Add totals row
  purchaseData.push([]);
  purchaseData.push([
    '',
    '',
    '',
    '',
    '',
    'TOTAL COMPRAS:',
    grandTotal > 0 ? `$${grandTotal.toLocaleString('es-AR')}` : '$0',
    '',
    '',
  ]);

  const wsPurchases = XLSX.utils.aoa_to_sheet(purchaseData);
  wsPurchases['!cols'] = [
    { wch: 22 },  // Fecha
    { wch: 24 },  // Proveedor
    { wch: 30 },  // Categoría
    { wch: 22 },  // Ítem
    { wch: 10 },  // Cantidad
    { wch: 18 },  // Precio Unitario
    { wch: 14 },  // Total
    { wch: 20 },  // Responsable
    { wch: 30 },  // Notas
  ];

  XLSX.utils.book_append_sheet(wb, wsPurchases, 'Compras');

  // ============================================
  // Sheet 2: Movimientos (all movements)
  // ============================================
  const movHeaders = [
    'Fecha',
    'Usuario',
    'Categoría',
    'Ítem',
    'Tipo',
    'Cantidad',
    'Stock Antes',
    'Stock Después',
    'Precio Unit. ($)',
    'Total ($)',
    'Proveedor',
    'Notas',
  ];

  const movData: string[][] = [movHeaders];

  for (const mov of movements) {
    const category = mov.path.slice(0, -1).join(' > ');
    const item = mov.path[mov.path.length - 1] || '';
    const actionLabel = getActionLabel(mov.action);

    movData.push([
      formatDate(mov.timestamp),
      mov.userName || 'Desconocido',
      category,
      item,
      actionLabel,
      String(mov.quantity),
      String(mov.stockBefore),
      String(mov.stockAfter),
      mov.unitCost != null ? String(mov.unitCost) : '',
      mov.totalCost != null ? String(mov.totalCost) : '',
      mov.supplier || '',
      mov.notes || '',
    ]);
  }

  const wsMovements = XLSX.utils.aoa_to_sheet(movData);
  wsMovements['!cols'] = [
    { wch: 22 },  // Fecha
    { wch: 20 },  // Usuario
    { wch: 30 },  // Categoría
    { wch: 22 },  // Ítem
    { wch: 12 },  // Tipo
    { wch: 10 },  // Cantidad
    { wch: 12 },  // Stock Antes
    { wch: 14 },  // Stock Después
    { wch: 16 },  // Precio Unit.
    { wch: 14 },  // Total
    { wch: 20 },  // Proveedor
    { wch: 30 },  // Notas
  ];

  XLSX.utils.book_append_sheet(wb, wsMovements, 'Movimientos');

  // ============================================
  // Output
  // ============================================
  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, finalFilename);
  } else {
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    return wbout;
  }
}
