import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { useContentFrame, Screen } from '@/components/layout/screen';
import { useFeedback } from '@/components/ui/feedback';
import { Check, CircleAlert, ClipboardList, Copy, X } from '@/components/ui/icons';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  Loading,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCart } from '@/context/cart-context';
import { useCatalog } from '@/context/catalog-context';
import { db } from '@/lib/firebase';
import {
  approveOrder,
  OrderAlreadyResolvedError,
  OrderShortageError,
  rejectOrder,
  type Order,
} from '@/services/orders';
import { colors, spacing, type Tone } from '@/theme/tokens';
import { formatDateTime, formatNumber, toMillis } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';
import { getUnit } from '@/utils/units';

type StatusFilter = 'all' | Order['status'];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'all', label: 'Todos' },
];

const STATUS: Record<Order['status'], { label: string; tone: Tone }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
};

function OrderCard({ order }: { order: Order }) {
  const router = useRouter();
  const { items: catalogItems, stockById } = useCatalog();
  const { addItem } = useCart();
  const { isAdmin, userProfile } = useAuth();
  const { toast, confirm } = useFeedback();
  const [processing, setProcessing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const status = STATUS[order.status] ?? STATUS.pending;

  const handleApprove = async () => {
    if (!userProfile) return;
    const accepted = await confirm({
      title: 'Aprobar pedido',
      message: `Se va a descontar el stock de ${order.items.length} ítem(s) del pedido de ${order.userName}.`,
      confirmLabel: 'Aprobar',
    });
    if (!accepted) return;

    setProcessing(true);
    try {
      await approveOrder(order, userProfile);
      toast('Pedido aprobado y stock actualizado.');
    } catch (error) {
      if (error instanceof OrderShortageError) {
        const detail = error.shortages
          .map((item) => `${item.name} (hay ${formatNumber(item.available)}, piden ${formatNumber(item.requested)})`)
          .join(', ');
        toast(`No alcanza el stock: ${detail}.`, 'danger');
      } else if (error instanceof OrderAlreadyResolvedError) {
        toast('Este pedido ya fue resuelto.', 'warning');
      } else {
        console.error('Error approving order:', error);
        toast('No se pudo aprobar el pedido.', 'danger');
      }
    } finally {
      setProcessing(false);
    }
  };

  /** Vuelve a cargar el pedido en el carrito, salvo lo que ya no está en el catálogo. */
  const handleRepeat = () => {
    const available = (order.items ?? []).filter((item) =>
      catalogItems.some((entry) => entry.id === pathToDocId(item.path))
    );
    available.forEach((item) => addItem({ ...item }));
    const missing = (order.items ?? []).length - available.length;
    if (!available.length) {
      toast('Ningún ítem de este pedido sigue en el catálogo.', 'warning');
      return;
    }
    if (missing) toast(`${missing} ítem(s) ya no están en el catálogo y quedaron afuera.`, 'warning');
    router.replace('/cart');
  };

  const handleReject = async () => {
    if (!userProfile) return;
    setProcessing(true);
    try {
      await rejectOrder(order, userProfile, reason);
      toast('Pedido rechazado.');
    } catch (error) {
      console.error('Error rejecting order:', error);
      toast('No se pudo rechazar el pedido.', 'danger');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {order.userName}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            {formatDateTime(order.createdAt)}
          </AppText>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>

      <Divider />

      <View style={styles.items}>
        {(order.items ?? []).map((item, index) => (
          <View key={index} style={styles.item}>
            <AppText variant="bodyStrong" style={styles.itemQuantity} tabular>
              {`${formatNumber(item.quantity)} ${
                getUnit(item.unit ?? stockById[pathToDocId(item.path)]?.unitOfMeasure).short
              }`}
            </AppText>
            <View style={styles.flex}>
              <AppText>{item.name}</AppText>
              <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                {item.path.slice(0, -1).join(' › ')}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {order.nombreObra ? (
        <AppText variant="small" color={colors.textMuted}>
          {`Obra: ${order.nombreObra}`}
        </AppText>
      ) : null}

      {order.notes ? (
        <AppText variant="small" color={colors.textMuted}>
          {`Notas: ${order.notes}`}
        </AppText>
      ) : null}

      {order.status === 'rejected' && (
        <AppText variant="small" color={colors.danger}>
          {`Motivo: ${order.rejectionReason ?? 'Sin motivo'}${order.resolvedByName ? ` · ${order.resolvedByName}` : ''}`}
        </AppText>
      )}
      {order.status === 'approved' && order.resolvedByName ? (
        <AppText variant="small" color={colors.success}>
          {`Aprobado por ${order.resolvedByName}`}
        </AppText>
      ) : null}

      {isAdmin && order.status === 'pending' && (
        rejecting ? (
          <View style={styles.reject}>
            <Field
              label="Motivo del rechazo (opcional)"
              value={reason}
              onChangeText={setReason}
              placeholder="Sin stock, pedido duplicado..."
            />
            <View style={styles.actions}>
              <Button label="Cancelar" variant="secondary" onPress={() => setRejecting(false)} />
              <Button label="Rechazar pedido" variant="danger" loading={processing} onPress={handleReject} />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <Button label="Rechazar" variant="secondary" icon={X} onPress={() => setRejecting(true)} />
            <Button label="Aprobar" icon={Check} loading={processing} onPress={handleApprove} />
          </View>
        )
      )}

      {order.status !== 'pending' && (
        <View style={styles.actions}>
          <Button label="Repetir pedido" variant="secondary" icon={Copy} onPress={handleRepeat} />
        </View>
      )}
    </Card>
  );
}

export default function OrdersScreen() {
  const { isAdmin, userProfile } = useAuth();
  const frame = useContentFrame();
  const uid = userProfile?.uid;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');

  useEffect(() => {
    if (!uid) return;
    const ordersRef = collection(db, 'orders');
    const source = isAdmin ? query(ordersRef) : query(ordersRef, where('userId', '==', uid));

    return onSnapshot(
      source,
      (snapshot) => {
        const next = snapshot.docs.map((order) => ({ id: order.id, ...order.data() }) as Order);
        next.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setOrders(next);
        setFailed(false);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading orders:', error);
        setFailed(true);
        setLoading(false);
      }
    );
  }, [isAdmin, uid]);

  const visible = orders.filter((order) => filter === 'all' || order.status === filter);

  return (
    <Screen title={isAdmin ? 'Pedidos' : 'Mis pedidos'} scroll={false}>
      <View style={frame}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={filter === option.value}
              onPress={() => setFilter(option.value)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <Loading label="Cargando pedidos" />
      ) : failed ? (
        <EmptyState
          icon={CircleAlert}
          title="No se pudieron cargar los pedidos"
          message="Revisá la conexión y volvé a entrar."
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(order) => order.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={[frame, styles.list]}
          ListEmptyComponent={
            <EmptyState
              icon={ClipboardList}
              title="Sin pedidos"
              message={orders.length ? 'No hay pedidos con este filtro.' : 'Todavía no se hicieron pedidos.'}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  filters: { gap: spacing.sm, paddingBottom: spacing.md },
  list: { gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  items: { gap: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.md },
  itemQuantity: { minWidth: 64, textAlign: 'right' },
  reject: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
});
