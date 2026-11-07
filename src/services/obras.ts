import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { roundQuantity } from '@/utils/format';

import { movementDelta, type ReversibleMovement } from './stock';

export const createObra = (nombre: string) =>
  addDoc(collection(db, 'obras'), { nombre, activa: true, createdAt: serverTimestamp() });

export const setObraActive = (id: string, activa: boolean) =>
  updateDoc(doc(db, 'obras', id), { activa });

export interface ObraConsumption {
  path: string[];
  quantity: number;
}

/** Material usado en una obra: retiros menos devoluciones y anulaciones. */
export async function loadObraConsumption(obraId: string): Promise<ObraConsumption[]> {
  const snapshot = await getDocs(query(collection(db, 'movements'), where('obraId', '==', obraId)));
  const totals = new Map<string, ObraConsumption>();

  snapshot.docs.forEach((item) => {
    const movement = { id: item.id, ...item.data() } as ReversibleMovement;
    const key = movement.path.join('\u0000');
    const current = totals.get(key) ?? { path: movement.path, quantity: 0 };
    totals.set(key, {
      ...current,
      quantity: roundQuantity(current.quantity - movementDelta(movement)),
    });
  });

  return [...totals.values()]
    .filter((entry) => entry.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity);
}
