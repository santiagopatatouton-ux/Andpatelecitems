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
  CircleAlert,
  ClipboardList,
  FileSpreadsheet,
  History as HistoryIcon,
  PackagePlus,
  Search,
  Undo2,
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
import { useCatalog } from '@/context/catalog-context';
import { db } from '@/lib/firebase';
import {
  AlreadyReversedError,
  InsufficientStockError,
  movementDelta,
  reverseMovement,
} from '@/services/stock';
import { isItemPath } from '@/utils/catalog-tree';
import { colors, iconSize, radius, spacing, toneColors, type Tone } from '@/theme/tokens';
import { exportAccountingExcel } from '@/utils/export-accounting';
import { ACTION_LABELS, exportFilename, exportMovementsToExcel, type MovementRow } from '@/utils/export-excel';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  isInRange,
  matchesSearch,
  monthRange,
  parseDateInput,
  toMillis,
  type DateRange,
} from '@/utils/format';
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

type PeriodFilter = 'all' | 'month' | 'lastMonth' | 'custom';

const PERIOD_FILTERS: { value: PeriodFilter; label: string }[] = [
  { value: 'all', label: 'Todas las fechas' },
  { value: 'month', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes pasado' },
  { value: 'custom', label: 'Elegir fechas' },
];

const ACTION_STYLES: Record<string, { icon: IconComponent; tone: Tone; sign: string }> = {
  retirar: { icon: ArrowUpFromLine, tone: 'danger', sign: '−' },
  devolver: { icon: ArrowDownToLine, tone: 'success', sign: '+' },
  compra: { icon: PackagePlus, tone: 'info', sign: '+' },
  ajuste: { icon: ClipboardList, tone: 'warning', sign: '' },
  anulacion: { icon: Undo2, tone: 'warning', sign: '' },
};

function toMovement(id: string, data: Record<string, unknown>): Movement {
  return { ...(data as unknown as MovementRow), id, path: (data.path as string[]) ?? [] };
}

const newestFirst = (a: Movement, b: Movement) =>
  toMillis(b.timestamp as never) - toMillis(a.timestamp as never);

function MovementRowView({
  movement,
  reversed,
  onReverse,
}: {
  movement: Movement;
  reversed: boolean;
  onReverse?: () => void;
}) {
  const style = ACTION_STYLES[movement.action] ?? ACTION_STYLES.retirar;
  const delta = movementDelta(movement);
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
            {`${delta < 0 ? '−' : '+'}${formatNumber(Math.abs(delta))}`}
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
            ...(movement.nombreObra ? [`Obra: ${movement.nombreObra}`] : []),
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
        {reversed ? (
          <AppText variant="smallStrong" color={colors.warning}>
            Anulado
          </AppText>
        ) : onReverse ? (
          <View style={styles.rowActions}>
            <Button label="Anular" variant="ghost" icon={Undo2} onPress={onReverse} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export default function HistoryScreen() {
  const { isAdmin, userProfile } = useAuth();
  const { toast, confirm } = useFeedback();
  const { tree } = useCatalog();
  const frame = useContentFrame();
  const uid = userProfile?.uid;

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState<'history' | 'accounting' | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [userFilter, setUserFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
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

  // Con filtros activos se busca en todo el historial, no solo en lo más reciente.
  const filtering =
    Boolean(search.trim()) || actionFilter !== 'all' || userFilter !== 'all' || period !== 'all';

  const range = useMemo<DateRange>(() => {
    if (period === 'month') return monthRange(0);
    if (period === 'lastMonth') return monthRange(-1);
    if (period === 'custom') return { from: parseDateInput(fromText), to: parseDateInput(toText) };
    return { from: null, to: null };
  }, [period, fromText, toText]);
  const inRange = useMemo(
    () => (movement: Movement) => isInRange(toMillis(movement.timestamp as never), range),
    [range]
  );

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'movements');
    const source = !isAdmin
      ? query(ref, where('userId', '==', uid))
      : filtering
        ? query(ref, orderBy('timestamp', 'desc'))
        : query(ref, orderBy('timestamp', 'desc'), limit(VISIBLE_LIMIT));

    return onSnapshot(
      source,
      (snapshot) => {
        setMovements(
          snapshot.docs.map((item) => toMovement(item.id, item.data())).sort(newestFirst)
        );
        setFailed(false);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading movements:', error);
        setFailed(true);
        setLoading(false);
      }
    );
  }, [isAdmin, uid, filtering]);

  const matchesFilters = useMemo(() => {
    return (movement: Movement) =>
      (actionFilter === 'all' || movement.action === actionFilter) &&
      (userFilter === 'all' || movement.userId === userFilter) &&
      inRange(movement) &&
      matchesSearch(movement.path.join(' '), search);
  }, [actionFilter, userFilter, search, inRange]);

  const visible = movements.filter(matchesFilters);
  const reversedIds = new Set(movements.flatMap((movement) => movement.reversalOf ?? []));

  const canReverse = (movement: Movement) =>
    isAdmin &&
    movement.action !== 'anulacion' &&
    movementDelta(movement) !== 0 &&
    !!tree &&
    isItemPath(tree, movement.path);

  const handleReverse = async (movement: Movement) => {
    if (!userProfile) return;
    const name = movement.path[movement.path.length - 1];
    const delta = movementDelta(movement);
    const accepted = await confirm({
      title: 'Anular movimiento',
      message: `Se va a ${delta < 0 ? 'devolver' : 'restar'} ${formatNumber(Math.abs(delta))} al stock de ${name}. El movimiento original queda en el historial.`,
      confirmLabel: 'Anular',
      destructive: true,
    });
    if (!accepted) return;
    try {
      await reverseMovement(movement, userProfile);
      toast('Movimiento anulado.');
    } catch (error) {
      if (error instanceof AlreadyReversedError) {
        toast('Ese movimiento ya estaba anulado.', 'warning');
      } else if (error instanceof InsufficientStockError) {
        toast(`No se puede anular: solo hay ${formatNumber(error.available)} en stock.`, 'danger');
      } else {
        console.error('Error reversing movement:', error);
        toast('No se pudo anular el movimiento.', 'danger');
      }
    }
  };

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
              onPress={() =>
                runExport('accounting', exportAccountingExcel, (rows) => rows.filter(inRange))
              }
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PERIOD_FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={period === option.value}
              onPress={() => setPeriod(option.value)}
            />
          ))}
        </ScrollView>

        {period === 'custom' && (
          <View style={styles.dates}>
            <Field
              label="Desde"
              value={fromText}
              onChangeText={setFromText}
              placeholder="dd/mm/aaaa"
              containerStyle={styles.flex}
              error={fromText && !range.from ? 'Fecha inválida' : undefined}
            />
            <Field
              label="Hasta"
              value={toText}
              onChangeText={setToText}
              placeholder="dd/mm/aaaa"
              containerStyle={styles.flex}
              error={toText && !range.to ? 'Fecha inválida' : undefined}
            />
          </View>
        )}

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
      ) : failed ? (
        <EmptyState
          icon={CircleAlert}
          title="No se pudo cargar el historial"
          message="Revisá la conexión y volvé a entrar."
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(movement) => movement.id}
          renderItem={({ item }) => (
            <MovementRowView
              movement={item}
              reversed={reversedIds.has(item.id)}
              onReverse={canReverse(item) ? () => handleReverse(item) : undefined}
            />
          )}
          contentContainerStyle={[frame, styles.list]}
          ListHeaderComponent={
            <AppText variant="small" color={colors.textMuted}>
              {`${visible.length} ${visible.length === 1 ? 'movimiento' : 'movimientos'}`}
              {isAdmin && !filtering && movements.length >= VISIBLE_LIMIT ? ` · últimos ${VISIBLE_LIMIT}` : ''}
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
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  dates: { flexDirection: 'row', gap: spacing.sm },
});
