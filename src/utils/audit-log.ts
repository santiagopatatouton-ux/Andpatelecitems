import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export type AuditAction =
  | 'add_item'
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
  target: string; // what was modified (item name, user name, etc.)
  details?: string; // additional context (path, old role → new role, etc.)
}

/**
 * Logs an audit event to the audit_log Firestore collection.
 * This should be called after every admin action that modifies data.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_log'), {
      ...event,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    // Don't block the main action if audit logging fails
    console.error('Error logging audit event:', error);
  }
}

/**
 * Returns a human-readable label for an audit action.
 */
export function getAuditActionLabel(action: AuditAction): string {
  const labels: Record<AuditAction, string> = {
    add_item: '📄 Ítem agregado',
    delete_item: '🗑️ Ítem eliminado',
    add_category: '📁 Categoría creada',
    delete_category: '🗑️ Categoría eliminada',
    create_user: '👤 Usuario creado',
    delete_user: '🗑️ Usuario eliminado',
    change_role: '🔄 Rol cambiado',
    edit_user: '✏️ Usuario editado',
    bulk_import: '📂 Importación masiva',
    approve_order: '✅ Pedido aprobado',
    reject_order: '❌ Pedido rechazado',
    add_stock: '📦 Stock agregado',
  };
  return labels[action] || action;
}

/**
 * Returns an emoji icon for an audit action type.
 */
export function getAuditActionIcon(action: AuditAction): string {
  const icons: Record<AuditAction, string> = {
    add_item: '📄',
    delete_item: '🗑️',
    add_category: '📁',
    delete_category: '🗑️',
    create_user: '👤',
    delete_user: '🗑️',
    change_role: '🔄',
    edit_user: '✏️',
    bulk_import: '📂',
    approve_order: '✅',
    reject_order: '❌',
    add_stock: '📦',
  };
  return icons[action] || '📋';
}
