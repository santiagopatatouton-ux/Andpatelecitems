import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useFeedback } from '@/components/ui/feedback';
import {
  AppText,
  Button,
  Card,
  Chip,
  Divider,
  Field,
  SectionTitle,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { movementDelta, setItemDetails, type ReversibleMovement } from '@/services/stock';
import { colors, spacing } from '@/theme/tokens';
import { ACTION_LABELS } from '@/utils/export-excel';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  LOW_STOCK_THRESHOLD,
  parseNumber,
  toMillis,
} from '@/utils/format';

const VISIBLE_MOVEMENTS = 5;

interface ItemMovement extends ReversibleMovement {
  userName?: string;
  timestamp: never;
}

/** Últimos movimientos del ítem. Un empleado ve solo los suyos, igual que en Historial. */
export function ItemHistory({ path }: { path: string[] }) {
  const { isAdmin, userProfile } = useAuth();
  const uid = userProfile?.uid;
  const [movements, setMovements] = useState<ItemMovement[]>([]);

  useEffect(() => {
    if (!uid || !path.length) return;
    const ref = collection(db, 'movements');
    const source = isAdmin
      ? query(ref, where('path', '==', path))
      : query(ref, where('path', '==', path), where('userId', '==', uid));
    return onSnapshot(
      source,
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as ItemMovement);
        next.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
        setMovements(next.slice(0, VISIBLE_MOVEMENTS));
      },
      (error) => console.error('Error loading item movements:', error)
    );
  }, [isAdmin, uid, path]);

  if (!movements.length) return null;

  return (
    <Card style={styles.card}>
      <SectionTitle title="Últimos movimientos" />
      {movements.map((movement, index) => {
        const delta = movementDelta(movement);
        return (
          <View key={movement.id} style={styles.movement}>
            {index > 0 && <Divider />}
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="smallStrong">
                  {ACTION_LABELS[movement.action] ?? movement.action}
                </AppText>
                <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                  {`${movement.userName || 'Desconocido'} · ${formatDateTime(movement.timestamp)}`}
                </AppText>
              </View>
              <AppText
                variant="bodyStrong"
                color={delta < 0 ? colors.danger : colors.success}
                tabular
              >
                {`${delta < 0 ? '−' : '+'}${formatNumber(Math.abs(delta))}`}
              </AppText>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** Código del fabricante y stock mínimo. Los ve cualquiera, los edita un admin. */
export function ItemDetails({
  path,
  code,
  minStock,
}: {
  path: string[];
  code?: string;
  minStock?: number;
}) {
  const { isAdmin } = useAuth();
  const { toast } = useFeedback();
  const [codeText, setCodeText] = useState(code ?? '');
  const [minText, setMinText] = useState(minStock === undefined ? '' : String(minStock));
  const [minError, setMinError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isAdmin) {
    return code ? (
      <AppText variant="small" color={colors.textMuted}>
        {`Código: ${code}`}
      </AppText>
    ) : null;
  }

  const handleSave = async () => {
    const parsed = minText.trim() ? parseNumber(minText) : null;
    if (minText.trim() && parsed === null) {
      setMinError('Ingresá un número o dejalo vacío.');
      return;
    }
    setMinError('');
    setSaving(true);
    try {
      await setItemDetails(path, parsed, codeText.trim());
      toast('Datos del ítem guardados.');
    } catch (error) {
      console.error('Error saving item details:', error);
      toast('No se pudieron guardar los datos.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <SectionTitle title="Datos del ítem" />
      <Field
        label="Código de artículo"
        value={codeText}
        onChangeText={setCodeText}
        placeholder="Código del fabricante"
        autoCorrect={false}
      />
      <Field
        label="Stock mínimo"
        value={minText}
        onChangeText={(text) => {
          setMinText(text);
          setMinError('');
        }}
        placeholder={String(LOW_STOCK_THRESHOLD)}
        hint="Con esta cantidad o menos pasa a Stock bajo."
        keyboardType="decimal-pad"
        error={minError}
      />
      <View style={styles.actions}>
        <Button label="Guardar datos" variant="secondary" loading={saving} onPress={handleSave} />
      </View>
    </Card>
  );
}

interface Supplier {
  name: string;
  price: number | null;
}

/** Proveedores de compras anteriores. Prioriza el último precio de este ítem. */
export function SupplierSuggestions({
  path,
  onPick,
}: {
  path: string[];
  onPick: (supplier: Supplier) => void;
}) {
  const { isAdmin, userProfile } = useAuth();
  const uid = userProfile?.uid;
  const [purchases, setPurchases] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'movements');
    const source = isAdmin
      ? query(ref, where('action', '==', 'compra'))
      : query(ref, where('action', '==', 'compra'), where('userId', '==', uid));
    getDocs(source)
      .then((snapshot) => setPurchases(snapshot.docs.map((item) => item.data())))
      .catch((error) => console.error('Error loading suppliers:', error));
  }, [isAdmin, uid]);

  const suppliers = useMemo(() => {
    const key = path.join('\u0000');
    const found = new Map<string, Supplier>();
    [...purchases]
      .sort((a, b) => toMillis(b.timestamp as never) - toMillis(a.timestamp as never))
      .forEach((purchase) => {
        const name = String(purchase.supplier ?? '').trim();
        if (!name) return;
        const sameItem = (purchase.path as string[]).join('\u0000') === key;
        const known = found.get(name);
        if (!known) found.set(name, { name, price: null });
        if (sameItem && !found.get(name)?.price && purchase.unitCost) {
          found.set(name, { name, price: purchase.unitCost as number });
        }
      });
    return [...found.values()];
  }, [purchases, path]);

  if (!suppliers.length) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {suppliers.map((supplier) => (
        <Chip
          key={supplier.name}
          label={
            supplier.price ? `${supplier.name} · ${formatMoney(supplier.price)}` : supplier.name
          }
          onPress={() => onPick(supplier)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: spacing.md },
  movement: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  chips: { gap: spacing.sm },
});
