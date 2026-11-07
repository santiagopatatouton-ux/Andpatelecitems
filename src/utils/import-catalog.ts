import * as XLSX from 'xlsx';

import type { CatalogTree } from './catalog-tree';
import { readWorkbook } from './read-workbook';

/**
 * Formato esperado:
 * | Categoría 1 | Categoría 2 | Categoría 3 | Ítem |
 * |-------------|-------------|-------------|------|
 * | Cables      | Unipolar    | 1mm         | Rojo |
 * | Cables      | Unipolar    | 1mm         | Azul |
 * | Cables      | Bipolar     |             | 3x2,5|
 *
 * La primera fila es el encabezado. En cada fila el último valor es el ítem y los
 * anteriores son las carpetas. Las celdas vacías se ignoran. Una fila con un solo
 * valor crea una carpeta vacía en la raíz.
 */

export interface ImportResult {
  tree: CatalogTree;
  itemCount: number;
  categoryCount: number;
  errors: string[];
}

/** Excel guarda 2,5 como número: se vuelve a escribir con coma, igual que en el catálogo. */
function cellText(cell: unknown): string {
  if (cell == null) return '';
  return typeof cell === 'number' ? String(cell).replace('.', ',') : String(cell).trim();
}

const failure = (message: string): ImportResult => ({
  tree: {},
  itemCount: 0,
  categoryCount: 0,
  errors: [message],
});

function addRow(tree: CatalogTree, cells: string[]) {
  const folders = cells.slice(0, -1);
  const item = cells[cells.length - 1];
  const parentPath = folders.slice(0, -1);
  const lastFolder = folders[folders.length - 1];
  let categories = 0;

  let node = tree;
  for (const folder of parentPath) {
    if (node[folder] === undefined) {
      node[folder] = {};
      categories++;
    }
    const next = node[folder];
    if (Array.isArray(next)) {
      throw new Error(`"${folder}" tiene ítems y también subcarpetas`);
    }
    node = next;
  }

  if (node[lastFolder] === undefined) {
    node[lastFolder] = [];
    categories++;
  }
  const target = node[lastFolder];
  if (!Array.isArray(target)) {
    throw new Error(`"${lastFolder}" tiene subcarpetas y también ítems`);
  }

  const isNew = !target.includes(item);
  if (isNew) target.push(item);
  return { categories, items: isNew ? 1 : 0 };
}

/** Lee un Excel o CSV, como base64 o ArrayBuffer, y arma un árbol de catálogo. */
export function parseCatalogExcel(data: string | ArrayBuffer, isBase64 = false): ImportResult {
  let rows: unknown[][];
  try {
    const workbook = readWorkbook(data, isBase64);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return failure('El archivo no tiene hojas.');
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  } catch (error) {
    return failure(`No se pudo leer el archivo: ${error instanceof Error ? error.message : error}`);
  }

  if (rows.length < 2) {
    return failure('El archivo necesita al menos 2 filas: encabezado y datos.');
  }

  const tree: CatalogTree = {};
  const errors: string[] = [];
  let itemCount = 0;
  let categoryCount = 0;

  rows.slice(1).forEach((row, index) => {
    const cells = Array.from(row, cellText).filter(Boolean);
    if (cells.length === 0) return;

    if (cells.length === 1) {
      if (tree[cells[0]] === undefined) {
        tree[cells[0]] = {};
        categoryCount++;
      }
      return;
    }

    try {
      const added = addRow(tree, cells);
      categoryCount += added.categories;
      itemCount += added.items;
    } catch (error) {
      errors.push(`Fila ${index + 2}: ${error instanceof Error ? error.message : error}`);
    }
  });

  return { tree, itemCount, categoryCount, errors };
}
