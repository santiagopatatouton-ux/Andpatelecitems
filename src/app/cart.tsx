import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useIsWide } from '@/components/layout/app-shell';
import { Screen } from '@/components/layout/screen';
import { ObraPicker } from '@/components/obra-picker';
import { useFeedback } from '@/components/ui/feedback';
import { ShoppingCart, Trash2 } from '@/components/ui/icons';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  IconButton,
  QuantityStepper,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCart, type CartItem } from '@/context/cart-context';
import { useCatalog } from '@/context/catalog-context';
import type { Obra } from '@/hooks/use-obras';
import { createOrder } from '@/services/orders';
import { colors, spacing } from '@/theme/tokens';
import { formatNumber, parseNumber } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';
import { getUnit } from '@/utils/units';

function CartRow({ item }: { item: CartItem }) {
  const { setQuantity, removeItem } = useCart();
  const { stockById } = useCatalog();
  const [text, setText] = useState(String(item.quantity).replace('.', ','));

  const info = stockById[pathToDocId(item.path)];
  const available = info?.stock ?? 0;
  const unit = getUnit(info?.unitOfMeasure ?? item.unit);
  const exceedsStock = item.quantity > available;

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {item.name}
        </AppText>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
          {item.path.slice(0, -1).join(' › ')}
        </AppText>
        <AppText variant="small" color={exceedsStock ? colors.warning : colors.textMuted}>
          {`Stock actual: ${formatNumber(available)} ${unit.short}`}
        </AppText>
      </View>
      <View style={styles.rowControls}>
        <QuantityStepper
          compact
          label={`Cantidad de ${item.name}`}
          value={text}
          decimal={unit.decimal}
          onChange={(value) => {
            setText(value);
            setQuantity(item.path, parseNumber(value) ?? 0);
          }}
        />
        <IconButton
          icon={Trash2}
          label={`Quitar ${item.name}`}
          color={colors.danger}
          onPress={() => removeItem(item.path)}
        />
      </View>
    </View>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { items, clear } = useCart();
  const { toast, confirm } = useFeedback();
  const wide = useIsWide();
  const [notes, setNotes] = useState('');
  const [obra, setObra] = useState<Obra | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClear = async () => {
    const accepted = await confirm({
      title: 'Vaciar carrito',
      message: '¿Quitar todos los ítems del carrito?',
      confirmLabel: 'Vaciar',
      destructive: true,
    });
    if (accepted) clear();
  };

  const handleSubmit = async () => {
    if (!userProfile) return;
    if (items.some((item) => !(item.quantity > 0))) {
      toast('Revisá las cantidades: hay ítems sin cantidad.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await createOrder(userProfile, items, notes.trim(), obra);
      clear();
      setNotes('');
      setObra(null);
      toast('Pedido enviado. Un administrador lo va a revisar.');
      router.replace('/orders');
    } catch (error) {
      console.error('Error creating order:', error);
      toast('No se pudo enviar el pedido. Revisá la conexión.', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  if (!items.length) {
    return (
      <Screen title="Carrito">
        <EmptyState
          icon={ShoppingCart}
          title="El carrito está vacío"
          message="Agregá ítems desde el catálogo para armar un pedido."
          action={<Button label="Ir al catálogo" onPress={() => router.replace('/')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Carrito"
      subtitle={`${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}`}
      actions={<Button label="Vaciar" variant="ghost" onPress={handleClear} />}
    >
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <Card style={[styles.list, wide && styles.listWide]}>
          {items.map((item, index) => (
            <View key={item.path.join('/')}>
              {index > 0 && <Divider />}
              <CartRow item={item} />
            </View>
          ))}
        </Card>

        <Card style={[styles.submit, wide && styles.submitWide]}>
          <ObraPicker value={obra} onChange={setObra} />
          <Field
            label="Notas del pedido (opcional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Urgencia o detalle"
            multiline
          />
          <Button
            label="Enviar pedido"
            size="lg"
            loading={submitting}
            onPress={handleSubmit}
            fullWidth
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  layout: { gap: spacing.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  list: { padding: 0, overflow: 'hidden' },
  listWide: { flex: 2, minWidth: 0 },
  submit: { gap: spacing.md },
  submitWide: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rowText: { flexGrow: 1, flexBasis: 180, minWidth: 0 },
  rowControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
