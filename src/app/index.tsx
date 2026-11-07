import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { CategoryCard, ItemRow, StatTile } from '@/components/catalog';
import { useIsWide } from '@/components/layout/app-shell';
import { Screen } from '@/components/layout/screen';
import { Boxes, CircleAlert, Folder, Search, X } from '@/components/ui/icons';
import {
  AppText,
  Card,
  Divider,
  EmptyState,
  Field,
  IconButton,
  Loading,
  SectionTitle,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCatalog, type CatalogItem } from '@/context/catalog-context';
import { colors, spacing } from '@/theme/tokens';
import { countItems, flattenTree, getChildren, getNodeAtPath } from '@/utils/catalog-tree';
import { matchesSearch, STOCK_LEVEL_LABELS, type StockLevel } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';
import { loadRecentItems } from '@/utils/recent-items';

const LEVELS: StockLevel[] = ['available', 'low', 'out'];
const GRID_COLUMNS = 3;

const countLabel = (count: number) => `${count} ${count === 1 ? 'ítem' : 'ítems'}`;

function ItemList({ items, showPath }: { items: CatalogItem[]; showPath?: boolean }) {
  const router = useRouter();
  return (
    <Card style={styles.list}>
      {items.map((item, index) => (
        <View key={item.id}>
          {index > 0 && <Divider />}
          <ItemRow
            name={item.name}
            detail={showPath ? item.path.slice(0, -1).join(' › ') : undefined}
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
  );
}

export default function CatalogScreen() {
  const { userProfile } = useAuth();
  const { tree, loading, error, items, counts } = useCatalog();
  const wide = useIsWide();
  const [path, setPath] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<StockLevel | null>(null);
  const [recent, setRecent] = useState<string[][]>([]);
  const uid = userProfile?.uid;

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Solo con el catálogo a la vista: si no, el botón atrás del ítem movería esta pantalla.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (levelFilter) setLevelFilter(null);
        else if (search) setSearch('');
        else if (path.length) setPath(path.slice(0, -1));
        else return false;
        return true;
      });
      return () => subscription.remove();
    }, [levelFilter, search, path])
  );

  // Al volver de un ítem la lista ya incluye el que se acaba de abrir.
  useFocusEffect(
    useCallback(() => {
      if (uid) loadRecentItems(uid).then(setRecent);
    }, [uid])
  );

  const query = search.trim();

  const results = useMemo(() => {
    if (!query || !tree) return { folders: [], items: [] };
    const matches = flattenTree(tree).filter((entry) => {
      const code = itemsById.get(pathToDocId(entry.path))?.code ?? '';
      return matchesSearch(`${entry.path.join(' ')} ${code}`, query);
    });
    return {
      folders: matches.filter((entry) => entry.type === 'category'),
      items: matches.flatMap((entry) => {
        const item = entry.type === 'item' ? itemsById.get(pathToDocId(entry.path)) : undefined;
        return item ? [item] : [];
      }),
    };
  }, [query, tree, itemsById]);

  const openFolder = (folderPath: string[]) => {
    setSearch('');
    setLevelFilter(null);
    setPath(folderPath);
  };

  const current = tree ? getNodeAtPath(tree, path) : undefined;
  const children = getChildren(current);
  const rows = Array.from({ length: Math.ceil(children.names.length / GRID_COLUMNS) }, (_, index) =>
    children.names.slice(index * GRID_COLUMNS, (index + 1) * GRID_COLUMNS)
  );
  const folderItems = children.type === 'items'
    ? children.names.flatMap((name) => itemsById.get(pathToDocId([...path, name])) ?? [])
    : [];

  const recentItems = recent.flatMap((item) => itemsById.get(pathToDocId(item)) ?? []);

  const folderCard = (name: string) => (
    <CategoryCard
      key={name}
      name={name}
      detail={countLabel(countItems(getNodeAtPath(tree ?? {}, [...path, name])))}
      onPress={() => openFolder([...path, name])}
    />
  );

  const renderContent = () => {
    if (loading) return <Loading label="Cargando catálogo" />;
    if (error) {
      return (
        <EmptyState
          icon={CircleAlert}
          title="No se pudo cargar el catálogo"
          message="Revisá la conexión y volvé a entrar."
        />
      );
    }

    if (query) {
      if (!results.folders.length && !results.items.length) {
        return (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            message={`No hay ítems ni carpetas con "${search.trim()}".`}
          />
        );
      }
      return (
        <>
          {results.folders.length > 0 && (
            <View style={styles.resultGroup}>
              {results.folders.map((folder) => (
                <CategoryCard
                  key={folder.path.join('/')}
                  name={folder.name}
                  detail={folder.path.slice(0, -1).join(' › ') || 'Carpeta principal'}
                  onPress={() => openFolder(folder.path)}
                />
              ))}
            </View>
          )}
          {results.items.length > 0 && <ItemList items={results.items} showPath />}
        </>
      );
    }

    if (levelFilter) {
      const filtered = items.filter((item) => item.level === levelFilter);
      return (
        <>
          <AppText variant="smallStrong" color={colors.textMuted}>
            {`${STOCK_LEVEL_LABELS[levelFilter]} · ${countLabel(filtered.length)}`}
          </AppText>
          {filtered.length ? (
            <ItemList items={filtered} showPath />
          ) : (
            <EmptyState icon={Boxes} title="No hay ítems en este estado" />
          )}
        </>
      );
    }

    if (children.type === 'empty') {
      return (
        <EmptyState
          icon={Folder}
          title={path.length ? 'Carpeta vacía' : 'El catálogo está vacío'}
          message="Un administrador puede cargar ítems desde Administración."
        />
      );
    }

    if (children.type === 'items') return <ItemList items={folderItems} />;

    if (!wide) {
      return <View style={styles.resultGroup}>{children.names.map(folderCard)}</View>;
    }

    return (
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row.join('/')} style={styles.gridRow}>
            {row.map(folderCard)}
            {Array.from({ length: GRID_COLUMNS - row.length }, (_, index) => (
              <View key={index} style={styles.flex} />
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <Screen
      title="Catálogo"
      subtitle={userProfile ? `Hola, ${userProfile.displayName.split(' ')[0]}` : undefined}
    >
      <Field
        label="Buscar"
        leading={Search}
        value={search}
        onChangeText={setSearch}
        placeholder="Ítem, carpeta, medida o código"
        autoCorrect={false}
        trailing={
          search ? (
            <IconButton
              icon={X}
              label="Limpiar búsqueda"
              color={colors.textMuted}
              onPress={() => setSearch('')}
            />
          ) : undefined
        }
      />

      {!query && (
        <View style={styles.stats}>
          {LEVELS.map((level) => (
            <StatTile
              key={level}
              level={level}
              label={STOCK_LEVEL_LABELS[level]}
              value={counts[level]}
              selected={levelFilter === level}
              onPress={() => setLevelFilter(levelFilter === level ? null : level)}
            />
          ))}
        </View>
      )}

      {!query && !levelFilter && path.length > 0 && (
        <Breadcrumbs root="Catálogo" path={path} onNavigate={setPath} />
      )}

      {!query && !levelFilter && path.length === 0 && recentItems.length > 0 && (
        <View style={styles.resultGroup}>
          <SectionTitle title="Usados recientemente" />
          <ItemList items={recentItems} showPath />
        </View>
      )}

      {renderContent()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  list: { padding: 0, overflow: 'hidden' },
  resultGroup: { gap: spacing.sm },
  grid: { gap: spacing.md },
  gridRow: { flexDirection: 'row', gap: spacing.md },
});
