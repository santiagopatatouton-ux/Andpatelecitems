import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

interface MovementRow {
  timestamp: any;
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

/**
 * Formats a Firestore timestamp or Date to a readable string
 */
function formatDate(timestamp: any): string {
  if (!timestamp) return 'Sin fecha';

  let date: Date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    return 'Sin fecha';
  }

  return date.toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Returns a human-readable label for a movement action type
 */
function getActionLabel(action: string): string {
  switch (action) {
    case 'retirar': return 'Egreso';
    case 'devolver': return 'Devolución';
    case 'compra': return 'Compra';
    default: return action;
  }
}

/**
 * Exports an array of movements to an Excel file.
 * On web: triggers a download.
 * On mobile: returns the base64 data for sharing.
 */
export function exportMovementsToExcel(
  movements: MovementRow[],
  filename?: string
): string | void {
  const defaultFilename = `historial_andpatelec_${new Date().toISOString().split('T')[0]}.xlsx`;
  const finalFilename = filename || defaultFilename;

  // Build worksheet data
  const wsData = [
    ['Fecha', 'Usuario', 'Categoría', 'Ítem', 'Acción', 'Cantidad', 'Stock Antes', 'Stock Después', 'Precio Unit. ($)', 'Total ($)', 'Proveedor', 'Notas'],
  ];

  for (const mov of movements) {
    const category = mov.path.slice(0, -1).join(' > ');
    const item = mov.path[mov.path.length - 1] || '';
    const actionLabel = getActionLabel(mov.action);

    wsData.push([
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

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 22 },  // Fecha
    { wch: 20 },  // Usuario
    { wch: 30 },  // Categoría
    { wch: 20 },  // Ítem
    { wch: 12 },  // Acción
    { wch: 10 },  // Cantidad
    { wch: 12 },  // Stock Antes
    { wch: 14 },  // Stock Después
    { wch: 16 },  // Precio Unit.
    { wch: 14 },  // Total
    { wch: 20 },  // Proveedor
    { wch: 30 },  // Notas
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Historial');

  if (Platform.OS === 'web') {
    // Web: trigger download
    XLSX.writeFile(wb, finalFilename);
  } else {
    // Mobile: return base64 string for expo-file-system + expo-sharing
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    return wbout;
  }
}

export { formatDate, getActionLabel };
export type { MovementRow };

