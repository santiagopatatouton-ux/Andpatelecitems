import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { CATALOG_TREE } from './catalog-data';

/**
 * Seeds the Firestore catalog/tree document with the initial catalog data.
 * Only seeds if the document doesn't already exist.
 * Returns true if seeded, false if already existed.
 */
export async function seedCatalog(): Promise<boolean> {
  try {
    const treeRef = doc(db, 'catalog', 'tree');
    const existing = await getDoc(treeRef);

    if (existing.exists()) {
      console.log('Catalog tree already exists in Firestore, skipping seed.');
      return false;
    }

    await setDoc(treeRef, CATALOG_TREE);
    console.log('✅ Catalog tree seeded successfully!');
    return true;
  } catch (error) {
    console.error('Error seeding catalog:', error);
    throw error;
  }
}
