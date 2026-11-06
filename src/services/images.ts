import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db, storage } from '@/lib/firebase';
import { pathToDocId } from '@/utils/paths';

/**
 * Firebase Storage todavía no está activado en el proyecto: no existe el bucket y
 * cualquier subida falla. Al activarlo, publicar reglas de Storage y pasar esto a true.
 */
export const IMAGE_UPLOAD_ENABLED = false;

export async function uploadItemImage(path: string[], uri: string) {
  const docId = pathToDocId(path);
  const blob = await (await fetch(uri)).blob();
  const imageRef = ref(storage, `items/${docId}_${Date.now()}.jpg`);
  await uploadBytes(imageRef, blob);
  const imageUrl = await getDownloadURL(imageRef);
  await setDoc(
    doc(db, 'stock', docId),
    { path, imageUrl, lastUpdated: serverTimestamp() },
    { merge: true }
  );
}

export function removeItemImage(path: string[]) {
  return setDoc(
    doc(db, 'stock', pathToDocId(path)),
    { path, imageUrl: null, lastUpdated: serverTimestamp() },
    { merge: true }
  );
}
