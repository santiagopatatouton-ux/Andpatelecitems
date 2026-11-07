import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { CATALOG_TREE } from '@/utils/catalog-data';
import {
  addEntries,
  CatalogError,
  cloneInto,
  mergeTrees,
  removeEntry,
  renameEntry,
  stockPathsUnder,
  type CatalogTree,
  type EntryKind,
} from '@/utils/catalog-tree';
import { pathToDocId } from '@/utils/paths';

const treeRef = doc(db, 'catalog', 'tree');
const stockRef = (path: string[]) => doc(db, 'stock', pathToDocId(path));

/** Edita el árbol sobre la última versión, para no pisar cambios de otro admin. */
async function updateTree(change: (tree: CatalogTree) => CatalogTree) {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(treeRef);
    transaction.set(treeRef, change((snapshot.data() ?? {}) as CatalogTree));
  });
}

export const addCatalogEntries = (path: string[], names: string[], kind: EntryKind) =>
  updateTree((tree) => addEntries(tree, path, names, kind));

export const cloneCatalogFolder = (targetPath: string[], sourcePath: string[]) =>
  updateTree((tree) => cloneInto(tree, targetPath, sourcePath));

export async function importCatalog(imported: CatalogTree) {
  let conflicts: string[] = [];
  await updateTree((tree) => {
    const result = mergeTrees(tree, imported);
    conflicts = result.conflicts;
    return result.tree;
  });
  return conflicts;
}

/** Carga el catálogo base solo si sigue vacío: nunca reemplaza uno con datos. */
export const seedBaseCatalog = () =>
  runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(treeRef);
    if (Object.keys(snapshot.data() ?? {}).length) {
      throw new CatalogError('El catálogo ya tiene datos.');
    }
    transaction.set(treeRef, CATALOG_TREE);
  });

/**
 * Renombra una entrada y mueve el stock de todo lo que cuelga de ella. El id de cada
 * documento de stock sale de su ruta: sin moverlo, el ítem renombrado quedaría en 0.
 */
export async function renameCatalogEntry(parentPath: string[], oldName: string, newName: string) {
  await runTransaction(db, async (transaction) => {
    const tree = ((await transaction.get(treeRef)).data() ?? {}) as CatalogTree;
    const updated = renameEntry(tree, parentPath, oldName, newName);

    const oldBase = [...parentPath, oldName];
    const paths = stockPathsUnder(tree, oldBase);
    const snapshots = await Promise.all(paths.map((path) => transaction.get(stockRef(path))));

    transaction.set(treeRef, updated);
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) return;
      const newPath = [...parentPath, newName, ...paths[index].slice(oldBase.length)];
      // "3/4" y "3.4" comparten documento: ahí solo cambia la ruta guardada.
      if (pathToDocId(newPath) === snapshot.id) {
        transaction.update(snapshot.ref, { path: newPath });
        return;
      }
      transaction.set(stockRef(newPath), { ...snapshot.data(), path: newPath });
      transaction.delete(snapshot.ref);
    });
  });
}

/** Borra una entrada junto con su stock, así no quedan alertas de ítems que ya no existen. */
export async function deleteCatalogEntry(parentPath: string[], name: string) {
  await runTransaction(db, async (transaction) => {
    const tree = ((await transaction.get(treeRef)).data() ?? {}) as CatalogTree;
    const paths = stockPathsUnder(tree, [...parentPath, name]);
    const snapshots = await Promise.all(paths.map((path) => transaction.get(stockRef(path))));

    transaction.set(treeRef, removeEntry(tree, parentPath, name));
    snapshots.forEach((snapshot) => {
      if (snapshot.exists()) transaction.delete(snapshot.ref);
    });
  });
}
