import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { logAuditEvent } from '@/utils/audit-log';
import { roundQuantity } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';

export interface OrderItem {
  path: string[];
  name: string;
  quantity: number;
  unit?: string;
}

export interface Order {
  id: string;
  userId: string;
  userName: string;
  items: OrderItem[];
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  obraId?: string;
  nombreObra?: string;
  createdAt: never;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: never;
  rejectionReason?: string;
}

interface Actor {
  uid: string;
  displayName: string;
}

export class OrderAlreadyResolvedError extends Error {}

export class OrderShortageError extends Error {
  constructor(public shortages: { name: string; requested: number; available: number }[]) {
    super('Stock insuficiente para el pedido');
  }
}

export function createOrder(
  user: Actor,
  items: OrderItem[],
  notes: string,
  obra: { id: string; nombre: string } | null
) {
  return addDoc(collection(db, 'orders'), {
    userId: user.uid,
    userName: user.displayName,
    items: items.map(({ path, name, quantity, unit }) => ({
      path,
      name,
      quantity,
      ...(unit ? { unit } : {}),
    })),
    notes,
    ...(obra ? { obraId: obra.id, nombreObra: obra.nombre } : {}),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

/** Pedidos pendientes con ítems dentro de una ruta. Renombrarla los dejaría sin stock. */
export async function countPendingOrdersUnder(base: string[]): Promise<number> {
  const pending = await getDocs(query(collection(db, 'orders'), where('status', '==', 'pending')));
  const isUnder = (item: OrderItem) => base.every((name, index) => item.path[index] === name);
  return pending.docs.filter((order) => (order.data().items ?? []).some(isUnder)).length;
}

/**
 * Aprueba un pedido, descuenta stock y registra los movimientos, todo o nada.
 * Si a algún ítem no le alcanza el stock no aprueba y dice cuáles faltan.
 */
export async function approveOrder(order: Order, admin: Actor) {
  const orderRef = doc(db, 'orders', order.id);
  const stockRefs = order.items.map((item) => doc(db, 'stock', pathToDocId(item.path)));

  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(orderRef);
    if (current.data()?.status !== 'pending') throw new OrderAlreadyResolvedError();

    const snapshots = await Promise.all(stockRefs.map((ref) => transaction.get(ref)));
    const levels = snapshots.map((snapshot) => (snapshot.data()?.stock ?? 0) as number);

    const shortages = order.items.flatMap((item, index) =>
      item.quantity > levels[index]
        ? [{ name: item.name, requested: item.quantity, available: levels[index] }]
        : []
    );
    if (shortages.length) throw new OrderShortageError(shortages);

    order.items.forEach((item, index) => {
      const stockAfter = roundQuantity(levels[index] - item.quantity);
      transaction.set(
        stockRefs[index],
        { path: item.path, stock: stockAfter, lastUpdated: serverTimestamp() },
        { merge: true }
      );
      transaction.set(doc(collection(db, 'movements')), {
        path: item.path,
        action: 'retirar',
        quantity: item.quantity,
        stockBefore: levels[index],
        stockAfter,
        notes: order.notes ? `Pedido aprobado: ${order.notes}` : 'Pedido aprobado',
        ...(order.obraId ? { obraId: order.obraId, nombreObra: order.nombreObra } : {}),
        timestamp: serverTimestamp(),
        userId: order.userId,
        userName: order.userName,
      });
    });

    transaction.update(orderRef, {
      status: 'approved',
      resolvedBy: admin.uid,
      resolvedByName: admin.displayName,
      resolvedAt: serverTimestamp(),
    });
  });

  await logAuditEvent({
    action: 'approve_order',
    adminId: admin.uid,
    adminName: admin.displayName,
    target: order.userName,
    details: `Pedido con ${order.items.length} ítem(s) aprobado`,
  });
}

export async function rejectOrder(order: Order, admin: Actor, reason: string) {
  const rejectionReason = reason.trim() || 'Sin motivo especificado';
  await updateDoc(doc(db, 'orders', order.id), {
    status: 'rejected',
    resolvedBy: admin.uid,
    resolvedByName: admin.displayName,
    resolvedAt: serverTimestamp(),
    rejectionReason,
  });

  await logAuditEvent({
    action: 'reject_order',
    adminId: admin.uid,
    adminName: admin.displayName,
    target: order.userName,
    details: `Pedido rechazado: ${rejectionReason}`,
  });
}
