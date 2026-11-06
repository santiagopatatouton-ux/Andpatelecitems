import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Screen, useContentFrame } from '@/components/layout/screen';
import { useFeedback } from '@/components/ui/feedback';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileSpreadsheet,
  History as HistoryIcon,
  PackagePlus,
  Search,
  type IconComponent,
} from '@/components/ui/icons';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Loading,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { colors, iconSize, radius, spacing, toneColors, type Tone } from '@/theme/tokens';
import { exportAccountingExcel } from '@/utils/export-accounting';
import { ACTION_LABELS, exportFilename, exportMovementsToExcel, type MovementRow } from '@/utils/export-excel';
import { formatDateTime, formatMoney, formatNumber, toMillis } from '@/utils/format';
import { shareExcel } from '@/utils/share-file';

/** Movimientos en pantalla para un admin. Los Excel incluyen todo el historial. */
const VISIBLE_LIMIT = 300;

interface Movement extends MovementRow {
  id: string;
  userId?: string;
}

type ActionFilter = 'all' | 'retirar' | 'devolver' | 'compra';

const ACTION_FILTERS: { value: ActionFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'compra', label: 'Compras' },
  { value: 'retirar', label: 'Egresos' },
  { value: 'devolver', label: 'Devoluciones' },
];

const ACTION_STYLES: Record<string, { icon: IconComponent; tone: Tone; sign: string }> = {
  retirar: { icon: ArrowUpFromLine, tone: 'danger', sign: '−' },
  devolver: { icon: ArrowDownToLine, tone: 'success', sign: '+' },
  compra: { icon: PackagePlus, tone: 'info', sign: '+' },
};

function toMovement(id: string, data: Record<string, unknown>): Movement {
  return { ...(data as unknown as MovementRow), id, path: (data.path as string[]) ?? [] };
}

const newestFirst = (a: Movement, b: Movement) =>
  toMillis(b.timestamp as never) - toMillis(a.timestamp as never);

function MovementRowView({ movement }: { movement: Movement }) {
  const style = ACTION_STYLES[movement.action] ?? ACTION_STYLES.retirar;
  const palette = toneColors[style.tone];
  const Icon = style.icon;
  const name = movement.path[movement.path.length - 1] ?? 'Ítem';

  return (
    <Card style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: palette.bg }]}>
        <Icon size={iconSize.md} color={palette.fg} strokeWidth={2} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {name}
          </AppText>
          <AppText variant="bodyStrong" color={palette.fg} tabular>
            {`${style.sign}${formatNumber(movement.quantity)}`}
          </AppText>
        </View>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
          {movement.path.slice(0, -1).join(' › ')}
        </AppText>
        <AppText variant="small" color={colors.textMuted}>
          {[
            ACTION_LABELS[movement.action] ?? movement.action,
            movement.userName || 'Desconocido',
            formatDateTime(movement.timestamp as never),
          ].join(' · ')}
        </AppText>
        <AppText variant="small" color={colors.textMuted} tabular>
          {`Stock ${formatNumber(movement.stockBefore ?? 0)} → ${formatNumber(movement.stockAfter ?? 0)}`}
          {movement.totalCost != null ? ` · Total ${formatMoney(movement.totalCost)}` : ''}
          {movement.supplier ? ` · ${movement.supplier}` : ''}
        </AppText>
        {movement.notes ? (
          <AppText variant="small" numberOfLines={2}>
            {movement.notes}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

export default function HistoryScreen() {
  const { isAdmin, userProfile } = useAuth();
  const { toast } = useFeedback();
  const frame = useContentFrame();
  const uid = userProfile?.uid;

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'history' | 'accounting' | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [userFilter, setUserFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<{ uid: string; displayName: string }[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    getDocs(collection(db, 'users'))
      .then((snapshot) =>
        setUsers(
          snapshot.docs.map((user) => ({
            uid: user.id,
            displayName: user.data().displayName ?? 'Sin nombre',
          }))
        )
      )
      .catch((error) => console.error('Error loading users:', error));
  }, [isAdmin]);

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'movements');
    const source = isAdmin
      ? query(ref, orderBy('timestamp', 'desc'), limit(VISIBLE_LIMIT))
      : query(ref, where('userId', '==', uid));

    return onSnapshot(
      source,
      (snapshot) => {
        setMovements(
          snapshot.docs.map((item) => toMovement(item.id, item.data())).sort(newestFirst)
        );
        setLoading(false);
      },
      (error) => {
        console.error('Error loading movements:', error);
        setLoading(false);
      }
    );
  }, [isAdmin, uid]);

  const matchesFilters = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (movement: Movement) =>
      (actionFilter === 'all' || movement.action === actionFilter) &&
      (userFilter === 'all' || movement.userId === userFilter) &&
      (!text || movement.path.join(' ').toLowerCase().includes(text));
  }, [actionFilter, userFilter, search]);

  const visible = movements.filter(matchesFilters);

  /** Para un admin baja todo el historial, no solo lo que está en pantalla. */
  const loadAll = async () => {
    if (!isAdmin) return movements;
    const snapshot = await getDocs(collection(db, 'movements'));
    return snapshot.docs.map((item) => toMovement(item.id, item.data())).sort(newestFirst);
  };

  const runExport = async (
    kind: 'history' | 'accounting',
    build: (rows: Movement[], filename: string) => string | undefined,
    selectRows: (rows: Movement[]) => Movement[]
  ) => {
    setExporting(kind);
    try {
      const rows = selectRows(await loadAll());
      if (!rows.length) {
        toast('No hay movimientos para exportar.', 'warning');
        return;
      }
      const filename = exportFilename(kind === 'history' ? 'historial' : 'contable');
      const base64 = build(rows, filename);
      if (Platform.OS === 'web') toast('Excel descargado.');
      else if (base64) await shareExcel(base64, filename, 'Exportar Excel');
    } catch (error) {
      console.error('Export error:', error);
      toast('No se pudo exportar el Excel.', 'danger');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Screen title={isAdmin ? 'Historial' : 'Mi historial'} scroll={false}>
      <View style={[frame, styles.filters]}>
        <View style={styles.exports}>
          <Button
            label="Excel"
            variant="secondary"
            icon={FileSpreadsheet}
            loading={exporting === 'history'}
            onPress={() =>
              runExport('history', exportMovementsToExcel, (rows) => rows.filter(matchesFilters))
            }
          />
          {isAdmin && (
            <Button
              label="Excel contable"
              variant="secondary"
              icon={FileSpreadsheet}
              loading={exporting === 'accounting'}
              onPress={() => runExport('accounting', exportAccountingExcel, (rows) => rows)}
            />
          )}
        </View>

        <Field
          label="Filtrar por ítem"
          leading={Search}
          value={search}
          onChangeText={setSearch}
          placeholder="Nombre o carpeta"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {ACTION_FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={actionFilter === option.value}
              onPress={() => setActionFilter(option.value)}
            />
          ))}
        </ScrollView>

        {isAdmin && users.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Todos" selected={userFilter === 'all'} onPress={() => setUserFilter('all')} />
            {users.map((user) => (
              <Chip
                key={user.uid}
                label={user.displayName}
                selected={userFilter === user.uid}
                onPress={() => setUserFilter(user.uid)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <Loading label="Cargando historial" />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(movement) => movement.id}
          renderItem={({ item }) => <MovementRowView movement={item} />}
          contentContainerStyle={[frame, styles.list]}
          ListHeaderComponent={
            <AppText variant="small" color={colors.textMuted}>
              {`${visible.length} ${visible.length === 1 ? 'movimiento' : 'movimientos'}`}
              {isAdmin && movements.length >= VISIBLE_LIMIT ? ` · últimos ${VISIBLE_LIMIT}` : ''}
            </AppText>
          }
          ListEmptyComponent={
            <EmptyState
              icon={HistoryIcon}
              title="Sin movimientos"
              message={
                movements.length
                  ? 'No hay resultados con estos filtros.'
                  : 'Todavía no hay movimientos registrados.'
              }
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
  exports: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { gap: spacing.sm },
  list: { gap: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
