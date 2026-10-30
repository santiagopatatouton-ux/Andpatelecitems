import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  collection,
  query,
  onSnapshot,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../context/auth-context';
import { logAuditEvent } from '../utils/audit-log';
import { pathToDocId } from '../utils/paths';

interface OrderItem {
  path: string[];
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  userId: string;
  userName: string;
  items: OrderItem[];
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: any;
  rejectionReason?: string;
}

export default function OrdersScreen() {
  const { isAdmin, userProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  // Subscribe to orders — always fetch all and sort/filter client-side
  // This avoids Firestore composite index requirements and handles null serverTimestamp
  useEffect(() => {
    const ordersRef = collection(db, 'orders');
    // Simple query without orderBy — we sort/filter client-side for reliability
    const q = query(ordersRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let items: Order[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Order[];

        // Filter for non-admin users: only show their own orders
        if (!isAdmin && userProfile?.uid) {
          items = items.filter((o) => o.userId === userProfile.uid);
        }

        // Sort client-side: newest first, handle null createdAt
        items.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || a.createdAt?.seconds
            ? new Date(a.createdAt.seconds * 1000)
            : new Date(0);
          const bTime = b.createdAt?.toDate?.() || b.createdAt?.seconds
            ? new Date(b.createdAt.seconds * 1000)
            : new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        setOrders(items);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading orders:', error);
        setOrders([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, userProfile?.uid]);

  const filteredOrders = orders.filter((o) => {
    if (filterStatus === 'all') return true;
    return o.status === filterStatus;
  });

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const handleApproveOrder = async (order: Order) => {
    const doApprove = async () => {
      setProcessing(order.id);
      try {
        // Deduct stock for each item in the order
        const batch = writeBatch(db);

        for (const item of order.items) {
          const docId = pathToDocId(item.path);
          const stockRef = doc(db, 'stock', docId);
          const stockSnap = await getDoc(stockRef);

          let currentStock = 0;
          if (stockSnap.exists()) {
            currentStock = stockSnap.data()?.stock || 0;
          }

          const newStock = Math.max(0, currentStock - item.quantity);

          batch.set(
            stockRef,
            {
              path: item.path,
              stock: newStock,
              lastUpdated: serverTimestamp(),
            },
            { merge: true }
          );

          // Log movement
          const movRef = doc(collection(db, 'movements'));
          batch.set(movRef, {
            path: item.path,
            action: 'retirar',
            quantity: item.quantity,
            stockBefore: currentStock,
            stockAfter: newStock,
            notes: `Pedido aprobado: ${order.notes || 'Sin notas'}`,
            timestamp: serverTimestamp(),
            userId: order.userId,
            userName: order.userName,
          });
        }

        // Update order status
        batch.update(doc(db, 'orders', order.id), {
          status: 'approved',
          resolvedBy: userProfile?.uid,
          resolvedByName: userProfile?.displayName,
          resolvedAt: serverTimestamp(),
        });

        await batch.commit();

        // Audit log
        await logAuditEvent({
          action: 'approve_order',
          adminId: userProfile?.uid || '',
          adminName: userProfile?.displayName || '',
          target: order.userName,
          details: `Pedido con ${order.items.length} ítem(s) aprobado`,
        });

        const msg = `✅ Pedido aprobado. Stock actualizado para ${order.items.length} ítem(s).`;
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Aprobado', msg);
      } catch (error) {
        console.error('Error approving order:', error);
        Alert.alert('Error', 'No se pudo aprobar el pedido.');
      } finally {
        setProcessing(null);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `¿Aprobar el pedido de ${order.userName}? Se descontará el stock de ${order.items.length} ítem(s).`
      );
      if (confirmed) doApprove();
    } else {
      Alert.alert(
        'Aprobar pedido',
        `¿Aprobar el pedido de ${order.userName}? Se descontará el stock de ${order.items.length} ítem(s).`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Aprobar', onPress: doApprove },
        ]
      );
    }
  };

  const handleRejectOrder = async (order: Order) => {
    setProcessing(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'rejected',
        resolvedBy: userProfile?.uid,
        resolvedByName: userProfile?.displayName,
        resolvedAt: serverTimestamp(),
        rejectionReason: rejectionReason.trim() || 'Sin motivo especificado',
      });

      await logAuditEvent({
        action: 'reject_order',
        adminId: userProfile?.uid || '',
        adminName: userProfile?.displayName || '',
        target: order.userName,
        details: `Pedido rechazado: ${rejectionReason.trim() || 'Sin motivo'}`,
      });

      setShowRejectInput(null);
      setRejectionReason('');

      const msg = '❌ Pedido rechazado.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Rechazado', msg);
    } catch (error) {
      console.error('Error rejecting order:', error);
      Alert.alert('Error', 'No se pudo rechazar el pedido.');
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'Sin fecha';
    let date: Date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp instanceof Date) date = timestamp;
    else return 'Sin fecha';
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: '⏳ Pendiente', style: styles.pendingBadge };
      case 'approved':
        return { label: '✅ Aprobado', style: styles.approvedBadge };
      case 'rejected':
        return { label: '❌ Rechazado', style: styles.rejectedBadge };
      default:
        return { label: status, style: styles.pendingBadge };
    }
  };

  const renderOrder = ({ item: order }: { item: Order }) => {
    const badge = getStatusBadge(order.status);
    const isProcessing = processing === order.id;

    return (
      <View style={styles.orderCard}>
        {/* Header */}
        <View style={styles.orderHeader}>
          <View style={badge.style}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
          <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
        </View>

        {/* User info */}
        <View style={styles.orderUserRow}>
          <Text style={styles.orderUserIcon}>👤</Text>
          <Text style={styles.orderUserName}>{order.userName}</Text>
        </View>

        {/* Items */}
        <View style={styles.itemsList}>
          {order.items.map((item, idx) => (
            <View key={idx} style={styles.orderItemRow}>
              <Text style={styles.orderItemQty}>{item.quantity}x</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderItemName}>{item.name}</Text>
                <Text style={styles.orderItemPath}>
                  {item.path.slice(0, -1).join(' › ')}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Notes */}
        {order.notes ? (
          <View style={styles.orderNotesBox}>
            <Text style={styles.orderNotes}>📝 {order.notes}</Text>
          </View>
        ) : null}

        {/* Rejection reason */}
        {order.status === 'rejected' && order.rejectionReason ? (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionText}>
              Motivo: {order.rejectionReason}
            </Text>
            {order.resolvedByName && (
              <Text style={styles.resolvedByText}>
                Por: {order.resolvedByName}
              </Text>
            )}
          </View>
        ) : null}

        {/* Approved info */}
        {order.status === 'approved' && order.resolvedByName ? (
          <View style={styles.approvedBox}>
            <Text style={styles.approvedText}>
              Aprobado por: {order.resolvedByName}
            </Text>
          </View>
        ) : null}

        {/* Admin actions */}
        {isAdmin && order.status === 'pending' && (
          <>
            {showRejectInput === order.id ? (
              <View style={styles.rejectInputSection}>
                <TextInput
                  style={styles.rejectInput}
                  placeholder="Motivo del rechazo (opcional)"
                  placeholderTextColor="#484f58"
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                />
                <View style={styles.rejectBtnRow}>
                  <TouchableOpacity
                    style={styles.cancelRejectBtn}
                    onPress={() => {
                      setShowRejectInput(null);
                      setRejectionReason('');
                    }}
                  >
                    <Text style={styles.cancelRejectText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmRejectBtn, isProcessing && styles.btnDisabled]}
                    onPress={() => handleRejectOrder(order)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmRejectText}>Rechazar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.adminActions}>
                <TouchableOpacity
                  style={[styles.approveBtn, isProcessing && styles.btnDisabled]}
                  onPress={() => handleApproveOrder(order)}
                  disabled={isProcessing}
                  activeOpacity={0.7}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.approveBtnText}>✅ Aprobar</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => setShowRejectInput(order.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rejectBtnText}>❌ Rechazar</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🛒</Text>
        <Text style={styles.headerTitle}>
          {isAdmin ? 'Pedidos' : 'Mis Pedidos'}
        </Text>
        {pendingCount > 0 && (
          <View style={styles.pendingCountBadge}>
            <Text style={styles.pendingCountText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => {
          const labels: Record<string, string> = {
            all: 'Todos',
            pending: '⏳ Pendientes',
            approved: '✅ Aprobados',
            rejected: '❌ Rechazados',
          };
          return (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterChip,
                filterStatus === status && styles.filterChipActive,
              ]}
              onPress={() => setFilterStatus(status)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterStatus === status && styles.filterChipTextActive,
                ]}
              >
                {labels[status]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1f6feb" />
          <Text style={styles.loadingText}>Cargando pedidos...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>Sin pedidos</Text>
          <Text style={styles.emptyText}>
            {orders.length === 0
              ? 'Todavía no se realizaron pedidos. Podés crear uno desde la pantalla de cada artículo.'
              : 'No hay pedidos con este filtro.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    gap: 10,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    color: '#f0f6fc',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  pendingCountBadge: {
    backgroundColor: '#d29922',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  pendingCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  filterChipActive: {
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
  },
  filterChipText: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#f0f6fc',
  },

  // Order cards
  orderCard: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  pendingBadge: {
    backgroundColor: '#2d2200',
    borderColor: '#d2992240',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  approvedBadge: {
    backgroundColor: '#0d2818',
    borderColor: '#23863640',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rejectedBadge: {
    backgroundColor: '#2d1215',
    borderColor: '#f8514940',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#f0f6fc',
    fontSize: 12,
    fontWeight: '600',
  },
  orderDate: {
    color: '#8b949e',
    fontSize: 12,
  },
  orderUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 6,
  },
  orderUserIcon: {
    fontSize: 14,
  },
  orderUserName: {
    color: '#c9d1d9',
    fontSize: 14,
    fontWeight: '600',
  },

  // Items
  itemsList: {
    padding: 14,
    gap: 8,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderItemQty: {
    color: '#58a6ff',
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 30,
  },
  orderItemName: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: '600',
  },
  orderItemPath: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 1,
  },

  // Notes
  orderNotesBox: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  orderNotes: {
    color: '#8b949e',
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Rejection
  rejectionBox: {
    backgroundColor: '#2d1215',
    padding: 10,
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 8,
  },
  rejectionText: {
    color: '#f85149',
    fontSize: 12,
    fontWeight: '500',
  },
  resolvedByText: {
    color: '#8b949e',
    fontSize: 11,
    marginTop: 4,
  },

  // Approved
  approvedBox: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  approvedText: {
    color: '#3fb950',
    fontSize: 12,
  },

  // Admin actions
  adminActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#21262d',
  },
  approveBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0d281833',
    borderRightWidth: 1,
    borderRightColor: '#21262d',
  },
  approveBtnText: {
    color: '#3fb950',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#2d121533',
  },
  rejectBtnText: {
    color: '#f85149',
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Reject input
  rejectInputSection: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
    backgroundColor: '#0d1117',
  },
  rejectInput: {
    backgroundColor: '#161b22',
    color: '#f0f6fc',
    borderColor: '#f8514940',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 10,
  },
  rejectBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelRejectBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#21262d',
    borderRadius: 8,
  },
  cancelRejectText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmRejectBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#b33a2a',
    borderRadius: 8,
  },
  confirmRejectText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // List
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },

  // Loading / Empty
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8b949e',
    marginTop: 12,
    fontSize: 14,
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    color: '#8b949e',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
