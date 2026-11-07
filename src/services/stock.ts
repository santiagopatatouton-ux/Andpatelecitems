import {
  collection,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { roundQuantity } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';

export type MovementAction = 'retirar' | 'devolver' | 'compra';

export interface ObraRef {
  id: string;
  nombre: string;
}

interface Actor {
  uid: string;
  displayName: string;
}

export interface MovementInput {
  path: string[];
  action: MovementAction;
  quantity: number;
  notes: string;
  unitCost?: number | null;
  supplier?: string | null;
  obra?: ObraRef | null;
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
      ...(input.obra ? { obraId: input.obra.id, nombreObra: input.obra.nombre } : {}),
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

/** Mínimo y código del ítem. Vacío en un campo vuelve al valor general. */
export function setItemDetails(path: string[], minStock: number | null, code: string) {
  return setDoc(
    doc(db, 'stock', pathToDocId(path)),
    {
      path,
      minStock: minStock ?? deleteField(),
      code: code || deleteField(),
      lastUpdated: serverTimestamp(),
    },
    { merge: true }
  );
}

export interface CountEntry {
  path: string[];
  counted: number;
}

const COUNT_CHUNK = 100;

/**
 * Guarda un conteo físico. Compara con el valor actual de la base y registra un ajuste
 * por cada diferencia. Devuelve cuántos ítems cambiaron.
 */
export async function saveCount(entries: CountEntry[], user: Actor): Promise<number> {
  let changed = 0;
  for (let start = 0; start < entries.length; start += COUNT_CHUNK) {
    const chunk = entries.slice(start, start + COUNT_CHUNK);
    changed += await runTransaction(db, async (transaction) => {
      const refs = chunk.map((entry) => doc(db, 'stock', pathToDocId(entry.path)));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      let updated = 0;

      chunk.forEach((entry, index) => {
        const stockBefore: number = snapshots[index].data()?.stock ?? 0;
        const stockAfter = roundQuantity(entry.counted);
        if (stockBefore === stockAfter) return;
        updated++;
        transaction.set(
          refs[index],
          { path: entry.path, stock: stockAfter, lastUpdated: serverTimestamp() },
          { merge: true }
        );
        transaction.set(doc(collection(db, 'movements')), {
          path: entry.path,
          action: 'ajuste',
          quantity: roundQuantity(Math.abs(stockAfter - stockBefore)),
          stockBefore,
          stockAfter,
          notes: 'Conteo físico',
          timestamp: serverTimestamp(),
          userId: user.uid,
          userName: user.displayName,
        });
      });
      return updated;
    });
  }
  return changed;
}

export class AlreadyReversedError extends Error {}

export interface ReversibleMovement {
  id: string;
  path: string[];
  action: string;
  quantity: number;
  stockBefore?: number;
  stockAfter?: number;
  obraId?: string;
  nombreObra?: string;
}

/** Cuánto cambió el stock con un movimiento. */
export function movementDelta(movement: ReversibleMovement): number {
  if (movement.action === 'retirar') return -movement.quantity;
  if (movement.action === 'devolver' || movement.action === 'compra') return movement.quantity;
  return roundQuantity((movement.stockAfter ?? 0) - (movement.stockBefore ?? 0));
}

/**
 * Revierte un movimiento con otro inverso y deja el historial intacto. El id deriva del
 * original: la misma anulación no se puede registrar dos veces.
 */
export async function reverseMovement(movement: ReversibleMovement, user: Actor) {
  const stockRef = doc(db, 'stock', pathToDocId(movement.path));
  const reversalRef = doc(db, 'movements', `anulacion_${movement.id}`);
  const delta = movementDelta(movement);

  await runTransaction(db, async (transaction) => {
    const [reversal, snapshot] = await Promise.all([
      transaction.get(reversalRef),
      transaction.get(stockRef),
    ]);
    if (reversal.exists()) throw new AlreadyReversedError();

    const stockBefore: number = snapshot.data()?.stock ?? 0;
    const stockAfter = roundQuantity(stockBefore - delta);
    if (stockAfter < 0) throw new InsufficientStockError(stockBefore);

    transaction.set(
      stockRef,
      { path: movement.path, stock: stockAfter, lastUpdated: serverTimestamp() },
      { merge: true }
    );
    transaction.set(reversalRef, {
      path: movement.path,
      action: 'anulacion',
      quantity: Math.abs(delta),
      stockBefore,
      stockAfter,
      reversalOf: movement.id,
      ...(movement.obraId ? { obraId: movement.obraId, nombreObra: movement.nombreObra } : {}),
      notes: 'Anulación de un movimiento',
      timestamp: serverTimestamp(),
      userId: user.uid,
      userName: user.displayName,
    });
  });
}
