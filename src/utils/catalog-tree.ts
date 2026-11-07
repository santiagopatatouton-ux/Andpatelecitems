import { pathToDocId } from './paths';

// El catálogo es un árbol guardado en un solo documento:
// un objeto es una carpeta con subcarpetas y un array es una carpeta con ítems finales.
export type CatalogNode = CatalogTree | string[];
export interface CatalogTree {
  [name: string]: CatalogNode;
}

export type EntryKind = 'subcategory' | 'item';

export interface Children {
  type: 'categories' | 'items' | 'empty';
  names: string[];
}

export interface CatalogEntry {
  name: string;
  path: string[];
  type: 'category' | 'item';
}

export class CatalogError extends Error {}

const isFolder = (node: unknown): node is CatalogTree =>
  typeof node === 'object' && node !== null && !Array.isArray(node);

export function getNodeAtPath(tree: CatalogTree, path: string[]): CatalogNode | undefined {
  let node: CatalogNode | undefined = tree;
  for (const key of path) {
    if (!isFolder(node)) return undefined;
    node = node[key];
  }
  return node;
}

/** Valor del número con que empieza un nombre: 1,5mm, 3/4" o 1 1/2". */
function leadingNumber(name: string): number | null {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)/.exec(name);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)/.exec(name);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = /^\d+(?:,\d+)?/.exec(name);
  return decimal ? Number(decimal[0].replace(',', '.')) : null;
}

/** Orden natural de medidas y nombres: 1mm, 1,5mm, 2,5mm, 10mm. */
export function compareNames(a: string, b: string): number {
  const first = leadingNumber(a);
  const second = leadingNumber(b);
  if (first !== null && second !== null && first !== second) return first - second;
  if (first !== null && second === null) return -1;
  if (first === null && second !== null) return 1;
  return a.localeCompare(b, 'es', { numeric: true });
}

export function getChildren(node: CatalogNode | undefined | null): Children {
  if (Array.isArray(node)) {
    return { type: node.length ? 'items' : 'empty', names: [...node].sort(compareNames) };
  }
  if (isFolder(node)) {
    const names = Object.keys(node).sort(compareNames);
    return { type: names.length ? 'categories' : 'empty', names };
  }
  return { type: 'empty', names: [] };
}

export function flattenTree(node: CatalogNode | undefined, base: string[] = []): CatalogEntry[] {
  if (Array.isArray(node)) {
    return [...node]
      .sort(compareNames)
      .map((name) => ({ name, path: [...base, name], type: 'item' }));
  }
  if (!isFolder(node)) return [];
  return Object.keys(node)
    .sort(compareNames)
    .flatMap((name) => [
      { name, path: [...base, name], type: 'category' as const },
      ...flattenTree(node[name], [...base, name]),
    ]);
}

export function getItems(tree: CatalogTree): CatalogEntry[] {
  return flattenTree(tree).filter((entry) => entry.type === 'item');
}

export function countItems(node: CatalogNode | undefined): number {
  return flattenTree(node).filter((entry) => entry.type === 'item').length;
}

export function isItemPath(tree: CatalogTree, path: string[]): boolean {
  const parent = getNodeAtPath(tree, path.slice(0, -1));
  return Array.isArray(parent) && parent.includes(path[path.length - 1]);
}

/**
 * Nombres cargados a mano: separados por coma, punto y coma o salto de línea.
 * Una coma seguida de un dígito es decimal: 1,5mm queda como un solo nombre.
 */
export function parseNames(input: string): string[] {
  return [...new Set(input.split(/[\n;]+|,(?!\d)/).map((name) => name.trim()).filter(Boolean))];
}

function cloneTree(tree: CatalogTree): CatalogTree {
  return JSON.parse(JSON.stringify(tree));
}

function requireParent(tree: CatalogTree, path: string[]) {
  const parent = path.length > 1 ? getNodeAtPath(tree, path.slice(0, -1)) : tree;
  if (!isFolder(parent)) throw new CatalogError('La carpeta ya no existe. Volvé a intentarlo.');
  return { parent, key: path[path.length - 1] };
}

/** Dos nombres distintos pueden caer en el mismo documento de stock: "3/4" y "3_4". */
function assertNoIdCollision(existing: string[], added: string[], path: string[]) {
  const ids = new Map(existing.map((name) => [pathToDocId([...path, name]), name]));
  for (const name of added) {
    const id = pathToDocId([...path, name]);
    const clash = ids.get(id);
    if (clash !== undefined && clash !== name) {
      throw new CatalogError(`"${name}" se confunde con "${clash}". Usá otro nombre.`);
    }
    ids.set(id, name);
  }
}

export function addEntries(
  source: CatalogTree,
  path: string[],
  names: string[],
  kind: EntryKind
): CatalogTree {
  const tree = cloneTree(source);

  if (path.length === 0) {
    if (kind === 'item') {
      throw new CatalogError('En la raíz solo se pueden crear carpetas.');
    }
    for (const name of names) tree[name] ??= {};
    return tree;
  }

  const { parent, key } = requireParent(tree, path);
  const target = parent[key];
  if (target === undefined) throw new CatalogError('La carpeta ya no existe. Volvé a intentarlo.');
  const children = getChildren(target);

  if (kind === 'item') {
    if (children.type === 'categories') {
      throw new CatalogError('Esta carpeta tiene subcarpetas: los ítems van dentro de ellas.');
    }
    const existing = Array.isArray(target) ? target : [];
    assertNoIdCollision(existing, names, path);
    parent[key] = [...new Set([...existing, ...names])];
    return tree;
  }

  if (children.type === 'items') {
    throw new CatalogError('Esta carpeta tiene ítems: no se le pueden agregar subcarpetas.');
  }
  const folder: CatalogTree = isFolder(target) ? target : {};
  assertNoIdCollision(Object.keys(folder), names, path);
  for (const name of names) folder[name] ??= {};
  parent[key] = folder;
  return tree;
}

export function renameEntry(
  source: CatalogTree,
  parentPath: string[],
  oldName: string,
  newName: string
): CatalogTree {
  const tree = cloneTree(source);
  const parent = parentPath.length ? getNodeAtPath(tree, parentPath) : tree;

  if (Array.isArray(parent)) {
    const index = parent.indexOf(oldName);
    if (index === -1) throw new CatalogError(`"${oldName}" ya no existe.`);
    if (parent.includes(newName)) throw new CatalogError(`Ya existe "${newName}".`);
    assertNoIdCollision(parent.filter((name) => name !== oldName), [newName], parentPath);
    parent[index] = newName;
    return tree;
  }

  if (!isFolder(parent) || parent[oldName] === undefined) {
    throw new CatalogError(`"${oldName}" ya no existe.`);
  }
  if (parent[newName] !== undefined) throw new CatalogError(`Ya existe "${newName}".`);
  assertNoIdCollision(Object.keys(parent).filter((name) => name !== oldName), [newName], parentPath);
  parent[newName] = parent[oldName];
  delete parent[oldName];
  return tree;
}

export function removeEntry(source: CatalogTree, parentPath: string[], name: string): CatalogTree {
  const tree = cloneTree(source);

  if (parentPath.length === 0) {
    delete tree[name];
    return tree;
  }

  const { parent, key } = requireParent(tree, parentPath);
  const target = parent[key];
  if (Array.isArray(target)) {
    parent[key] = target.filter((item) => item !== name);
  } else if (isFolder(target)) {
    delete target[name];
  }
  return tree;
}

/** Copia el contenido de otra carpeta dentro de la actual, sin borrar lo que ya hay. */
export function cloneInto(
  source: CatalogTree,
  targetPath: string[],
  sourcePath: string[]
): CatalogTree {
  const content = getNodeAtPath(source, sourcePath);
  if (content === undefined) throw new CatalogError('La carpeta de origen ya no existe.');
  const isInsideItself = sourcePath.every((name, index) => targetPath[index] === name);
  if (isInsideItself) throw new CatalogError('No se puede copiar una carpeta dentro de sí misma.');

  const tree = cloneTree(source);
  const { parent, key } = requireParent(tree, targetPath);
  const merged = mergeTrees({ [key]: parent[key] }, {
    [key]: JSON.parse(JSON.stringify(content)),
  });
  if (merged.conflicts.length) {
    throw new CatalogError('No se pueden mezclar ítems y subcarpetas en la misma carpeta.');
  }
  parent[key] = merged.tree[key];
  return tree;
}

export interface MergeResult {
  tree: CatalogTree;
  /** Rutas donde el archivo mezcla ítems y carpetas con lo existente. Se conserva lo existente. */
  conflicts: string[];
}

/** Nombres distintos que irían al mismo documento de stock, como "3/4" y "3_4". */
const namesCollide = (names: string[]) =>
  new Set(names.map((name) => pathToDocId([name]))).size < new Set(names).size;

/** Fusiona sin borrar nada. Una carpeta vacía adopta la forma de lo importado. */
export function mergeTrees(existing: CatalogTree, imported: CatalogTree): MergeResult {
  const conflicts: string[] = [];

  const mergeFolder = (target: CatalogTree, incoming: CatalogTree, base: string[]): CatalogTree => {
    const result: CatalogTree = { ...target };
    for (const [key, value] of Object.entries(incoming)) {
      const path = [...base, key];
      const current = result[key];
      const currentType = getChildren(current).type;
      const incomingType = getChildren(value).type;

      if (current === undefined && namesCollide([...Object.keys(result), key])) {
        conflicts.push(path.join(' › '));
      } else if (Array.isArray(value) && namesCollide(value)) {
        conflicts.push(path.join(' › '));
      } else if (current === undefined || currentType === 'empty') {
        result[key] = value;
      } else if (incomingType === 'empty') {
        continue;
      } else if (Array.isArray(current) && Array.isArray(value)) {
        const merged = [...new Set([...current, ...value])];
        if (namesCollide(merged)) conflicts.push(path.join(' › '));
        else result[key] = merged;
      } else if (isFolder(current) && isFolder(value)) {
        result[key] = mergeFolder(current, value, path);
      } else {
        conflicts.push(path.join(' › '));
      }
    }
    return result;
  };

  return { tree: mergeFolder(existing, imported, []), conflicts };
}

/** Rutas de los documentos de stock que cuelgan de una entrada. */
export function stockPathsUnder(tree: CatalogTree, path: string[]): string[][] {
  const node = getNodeAtPath(tree, path);
  const leaves = flattenTree(node, path).filter((entry) => entry.type === 'item');
  return [path, ...leaves.map((entry) => entry.path)];
}
