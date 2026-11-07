import { useRouter } from 'expo-router';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ItemRow } from '@/components/catalog';
import { useFeedback } from '@/components/ui/feedback';
import { FileSpreadsheet } from '@/components/ui/icons';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  Loading,
  SectionTitle,
} from '@/components/ui/primitives';
import { useCatalog, type CatalogItem } from '@/context/catalog-context';
import { db } from '@/lib/firebase';
import { colors, spacing } from '@/theme/tokens';
import { exportFilename } from '@/utils/export-excel';
import { exportStockExcel } from '@/utils/export-stock';
import { formatMoney, formatNumber, monthRange, roundQuantity } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';
import { shareExcel } from '@/utils/share-file';
import { getUnit } from '@/utils/units';

const VISIBLE_ROWS = 8;
const TOP_ITEMS = 5;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card style={styles.stat}>
      <AppText variant="smallStrong" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="title" tabular>
        {value}
      </AppText>
      {hint ? (
        <AppText variant="small" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </Card>
  );
}

interface TopItem {
  path: string[];
  quantity: number;
}

/** Retiros del mes en curso, de mayor a menor. */
function useTopWithdrawals() {
  const [top, setTop] = useState<TopItem[]>([]);

  useEffect(() => {
    const start = Timestamp.fromDate(monthRange(0).from as Date);
    getDocs(query(collection(db, 'movements'), where('timestamp', '>=', start)))
      .then((snapshot) => {
        const totals = new Map<string, TopItem>();
        snapshot.docs.forEach((item) => {
          const { action, path, quantity } = item.data();
          if (action !== 'retirar') return;
          const key = path.join('\u0000');
          const current = totals.get(key)?.quantity ?? 0;
          totals.set(key, { path, quantity: roundQuantity(current + quantity) });
        });
        setTop([...totals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, TOP_ITEMS));
      })
      .catch((error) => console.error('Error loading withdrawals:', error));
  }, []);

  return top;
}

function usePendingCount() {
  const [count, setCount] = useState(0);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'orders'), where('status', '==', 'pending')),
        (snapshot) => setCount(snapshot.size),
        (error) => console.error('Error loading pending orders:', error)
      ),
    []
  );
  return count;
}

/** Con mínimo propio primero: son los que alguien decidió vigilar. */
const restockOrder = (a: CatalogItem, b: CatalogItem) =>
  Number(b.minStock !== undefined) - Number(a.minStock !== undefined) || b.stock - a.stock;

export function SummaryAdmin() {
  const router = useRouter();
  const { items, loading, stockById } = useCatalog();
  const { toast } = useFeedback();
  const top = useTopWithdrawals();
  const pendingOrders = usePendingCount();

  const { value, priced } = useMemo(() => {
    const withPrice = items.filter((item) => item.unitCost && item.stock > 0);
    return {
      value: withPrice.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.stock, 0),
      priced: withPrice.length,
    };
  }, [items]);

  const toRestock = useMemo(
    () => items.filter((item) => item.level !== 'available').sort(restockOrder),
    [items]
  );

  if (loading) return <Loading label="Cargando resumen" />;

  const download = async (rows: CatalogItem[], prefix: string, sheet: string) => {
    try {
      const filename = exportFilename(prefix);
      const base64 = exportStockExcel(rows, filename, sheet);
      if (Platform.OS === 'web') toast('Excel descargado.');
      else if (base64) await shareExcel(base64, filename, 'Exportar Excel');
    } catch (error) {
      console.error('Export error:', error);
      toast('No se pudo exportar el Excel.', 'danger');
    }
  };

  const stocked = items.filter((item) => item.stock > 0).length;

  return (
    <>
      <View style={styles.stats}>
        <Stat
          label="Valor del stock"
          value={formatMoney(value)}
          hint={`${priced} de ${stocked} ítems con stock tienen precio`}
        />
        <Stat label="Pedidos pendientes" value={String(pendingOrders)} />
        <Stat label="Para reponer" value={String(toRestock.length)} />
      </View>

      <View style={styles.actions}>
        <Button
          label="Excel de stock"
          variant="secondary"
          icon={FileSpreadsheet}
          onPress={() => download(items, 'stock', 'Stock')}
        />
        <Button
          label="Excel para reponer"
          variant="secondary"
          icon={FileSpreadsheet}
          onPress={() => download(toRestock, 'reponer', 'Para reponer')}
        />
      </View>

      <SectionTitle title="Más retirado este mes" />
      {top.length === 0 ? (
        <Card>
          <EmptyState icon={FileSpreadsheet} title="Sin retiros este mes" />
        </Card>
      ) : (
        <Card style={styles.list}>
          {top.map((entry, index) => {
            const unit = getUnit(stockById[pathToDocId(entry.path)]?.unitOfMeasure);
            return (
              <View key={entry.path.join('/')}>
                {index > 0 && <Divider />}
                <View style={styles.topRow}>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {entry.path[entry.path.length - 1]}
                    </AppText>
                    <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                      {entry.path.slice(0, -1).join(' › ')}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong" tabular>
                    {`${formatNumber(entry.quantity)} ${unit.short}`}
                  </AppText>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {toRestock.length > 0 && (
        <>
          <SectionTitle
            title="Para reponer"
            hint={
              toRestock.length > VISIBLE_ROWS
                ? `Primeros ${VISIBLE_ROWS} de ${toRestock.length}`
                : undefined
            }
          />
          <Card style={styles.list}>
            {toRestock.slice(0, VISIBLE_ROWS).map((item, index) => (
              <View key={item.id}>
                {index > 0 && <Divider />}
                <ItemRow
                  name={item.name}
                  detail={item.path.slice(0, -1).join(' › ')}
                  stock={item.stock}
                  level={item.level}
                  unit={item.unitOfMeasure}
                  onPress={() =>
                    router.push({ pathname: '/action', params: { path: JSON.stringify(item.path) } })
                  }
                />
              </View>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexGrow: 1, flexBasis: 200, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { padding: 0, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
});
