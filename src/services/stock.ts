import { collection, doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { roundQuantity } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';

export type MovementAction = 'retirar' | 'devolver' | 'compra';

export interface MovementInput {
  path: string[];
  action: MovementAction;
  quantity: number;
  notes: string;
  unitCost?: number | null;
  supplier?: string | null;
  userId: string;
  userName: string;
}

export class InsufficientStockError extends Error {
  constructor(public available: number) {
    super('Stock insuficiente');
  }
}

/**
 * Mueve stock y registra el movimiento en una sola transacción. Lee el valor actual
 * en la base, no el de la pantalla: dos personas a la vez no se pisan.
 */
export async function applyMovement(input: MovementInput): Promise<number> {
  const { path, action, quantity, notes, userId, userName } = input;
  const unitCost = input.unitCost ?? null;
  const ref = doc(db, 'stock', pathToDocId(path));

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const stockBefore: number = snapshot.data()?.stock ?? 0;

    if (action === 'retirar' && quantity > stockBefore) {
      throw new InsufficientStockError(stockBefore);
    }

    const delta = action === 'retirar' ? -quantity : quantity;
    const stockAfter = roundQuantity(stockBefore + delta);

    transaction.set(
      ref,
      {
        path,
        stock: stockAfter,
        lastUpdated: serverTimestamp(),
        ...(unitCost != null && { unitCost, lastPurchaseDate: serverTimestamp() }),
      },
      { merge: true }
    );

    transaction.set(doc(collection(db, 'movements')), {
      path,
      action,
      quantity,
      stockBefore,
      stockAfter,
      unitCost,
      totalCost: unitCost != null ? roundQuantity(unitCost * quantity) : null,
      supplier: input.supplier ?? null,
      notes,
      timestamp: serverTimestamp(),
      userId,
      userName,
    });

    return stockAfter;
  });
}

export function setUnitOfMeasure(path: string[], unitOfMeasure: string) {
  return setDoc(
    doc(db, 'stock', pathToDocId(path)),
    { path, unitOfMeasure, lastUpdated: serverTimestamp() },
    { merge: true }
  );
}
