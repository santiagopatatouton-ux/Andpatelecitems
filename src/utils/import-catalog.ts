import * as XLSX from 'xlsx';

/**
 * Expected Excel format:
 * | Categoría 1 | Categoría 2 | Categoría 3 | Ítem |
 * |-------------|-------------|-------------|------|
 * | Cables      | Unipolar    | 1mm         | Rojo |
 * | Cables      | Unipolar    | 1mm         | Azul |
 * | Cables      | Bipolar     |             | 3x2,5|
 *
 * Rules:
 * - Columns represent depth levels in the tree
 * - The last non-empty column value in a row is treated as a leaf item
 * - Empty cells are skipped for that depth level
 */

interface ImportResult {
  tree: Record<string, any>;
  itemCount: number;
  categoryCount: number;
  errors: string[];
}

/**
 * Parse an Excel/CSV file (as base64 or ArrayBuffer) into a catalog tree.
 */
export function parseCatalogExcel(data: string | ArrayBuffer, isBase64 = false): ImportResult {
  const errors: string[] = [];
  let itemCount = 0;
  let categoryCount = 0;

  try {
    const wb = XLSX.read(data, {
      type: isBase64 ? 'base64' : 'array',
    });

    if (wb.SheetNames.length === 0) {
      return { tree: {}, itemCount: 0, categoryCount: 0, errors: ['El archivo no contiene hojas.'] };
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

    if (rows.length < 2) {
      return { tree: {}, itemCount: 0, categoryCount: 0, errors: ['El archivo necesita al menos 2 filas (encabezado + datos).'] };
    }

    // Skip header row
    const dataRows = rows.slice(1);
    const tree: Record<string, any> = {};

    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];

      // Find all non-empty cells
      const cells = row
        .map((cell) => (cell != null ? String(cell).trim() : ''))
        .filter((cell) => cell.length > 0);

      if (cells.length === 0) continue;

      if (cells.length === 1) {
        // Single value = top-level category with no children
        if (!tree[cells[0]]) {
          tree[cells[0]] = {};
          categoryCount++;
        }
        continue;
      }

      // Navigate/create the tree path
      const categories = cells.slice(0, -1);
      const item = cells[cells.length - 1];

      let node: any = tree;

      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];

        if (node[cat] === undefined) {
          node[cat] = {};
          categoryCount++;
        }

        // If the node was previously an array (leaf items), convert to object
        if (Array.isArray(node[cat])) {
          const existing = node[cat] as string[];
          const newObj: Record<string, any> = {};
          for (const existingItem of existing) {
            newObj[existingItem] = [];
          }
          node[cat] = newObj;
        }

        node = node[cat];
      }

      // Add the leaf item
      const lastCat = categories[categories.length - 1];
      const parentNode = categories.length > 1
        ? getNodeAtPath(tree, categories.slice(0, -1))
        : tree;

      if (parentNode && typeof parentNode === 'object') {
        const target = parentNode[lastCat];

        if (Array.isArray(target)) {
          if (!target.includes(item)) {
            target.push(item);
            itemCount++;
          }
        } else if (typeof target === 'object' && target !== null) {
          // Check if item already exists as a key
          if (target[item] === undefined) {
            // We need to determine: is this an item or a subcategory?
            // Since it's the last cell, treat it as a final item
            // Convert the object to hold arrays at this level
            if (Object.keys(target).length === 0) {
              // Empty object → convert parent to hold an array
              parentNode[lastCat] = [item];
              itemCount++;
            } else {
              // Object already has keys → add as a sub-entry
              target[item] = [];
              itemCount++;
            }
          }
        }
      }
    }

    return { tree, itemCount, categoryCount, errors };
  } catch (error: any) {
    return {
      tree: {},
      itemCount: 0,
      categoryCount: 0,
      errors: [`Error al leer el archivo: ${error.message || error}`],
    };
  }
}

function getNodeAtPath(tree: Record<string, any>, path: string[]): any {
  let node: any = tree;
  for (const key of path) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      node = node[key];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * Deep merges an imported tree into an existing tree without deleting data.
 * Arrays are merged (union), objects are recursively merged.
 */
export function mergeTrees(existing: Record<string, any>, imported: Record<string, any>): Record<string, any> {
  const result = { ...existing };

  for (const key of Object.keys(imported)) {
    if (result[key] === undefined) {
      // New key → add it
      result[key] = imported[key];
    } else if (Array.isArray(result[key]) && Array.isArray(imported[key])) {
      // Both arrays → merge unique items
      const merged = [...result[key]];
      for (const item of imported[key]) {
        if (!merged.includes(item)) {
          merged.push(item);
        }
      }
      result[key] = merged;
    } else if (
      typeof result[key] === 'object' &&
      !Array.isArray(result[key]) &&
      typeof imported[key] === 'object' &&
      !Array.isArray(imported[key])
    ) {
      // Both objects → recurse
      result[key] = mergeTrees(result[key], imported[key]);
    } else if (Array.isArray(result[key]) && typeof imported[key] === 'object') {
      // Existing is array, imported is object → convert array items to object keys, then merge
      const converted: Record<string, any> = {};
      for (const item of result[key]) {
        converted[item] = [];
      }
      result[key] = mergeTrees(converted, imported[key]);
    } else if (typeof result[key] === 'object' && Array.isArray(imported[key])) {
      // Existing is object, imported is array → add array items as keys
      const target = { ...result[key] };
      for (const item of imported[key]) {
        if (target[item] === undefined) {
          target[item] = [];
        }
      }
      result[key] = target;
    }
    // If types conflict in other ways, keep existing
  }

  return result;
}

/**
 * Counts total items in a tree (leaf items only).
 */
export function countTreeItems(node: any): number {
  if (!node) return 0;
  if (Array.isArray(node)) return node.length;
  if (typeof node === 'object') {
    let count = 0;
    for (const key of Object.keys(node)) {
      count += countTreeItems(node[key]);
    }
    return count;
  }
  return 0;
}

/**
 * Counts total categories in a tree.
 */
export function countTreeCategories(node: any): number {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return 0;
  let count = Object.keys(node).length;
  for (const key of Object.keys(node)) {
    count += countTreeCategories(node[key]);
  }
  return count;
}
