import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';

export type AuditAction =
  | 'add_item'
  | 'rename_item'
  | 'delete_item'
  | 'add_category'
  | 'delete_category'
  | 'create_user'
  | 'delete_user'
  | 'change_role'
  | 'edit_user'
  | 'bulk_import'
  | 'approve_order'
  | 'reject_order'
  | 'add_stock';

export interface AuditEvent {
  action: AuditAction;
  adminId: string;
  adminName: string;
  target: string;
  details?: string;
}

/** Registra una acción de admin. Si falla no frena la acción principal, que ya se hizo. */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_log'), { ...event, timestamp: serverTimestamp() });
  } catch (error) {
    console.error('Error logging audit event:', error);
  }
}

const LABELS: Record<AuditAction, string> = {
  add_item: 'Ítem agregado',
  rename_item: 'Renombrado',
  delete_item: 'Ítem eliminado',
  add_category: 'Carpeta creada',
  delete_category: 'Carpeta eliminada',
  create_user: 'Usuario creado',
  delete_user: 'Usuario eliminado',
  change_role: 'Rol cambiado',
  edit_user: 'Usuario editado',
  bulk_import: 'Importación masiva',
  approve_order: 'Pedido aprobado',
  reject_order: 'Pedido rechazado',
  add_stock: 'Stock agregado',
};

export function getAuditActionLabel(action: AuditAction): string {
  return LABELS[action] ?? action;
}
