import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Platform,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { seedCatalog } from '../utils/seed-catalog';
import { CATEGORY_ICONS } from '../utils/catalog-data';
import { useAuth } from '../context/auth-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 600;

// Helper to get a node from the tree given a path
function getNodeAtPath(tree: Record<string, any>, path: string[]): any {
  let node: any = tree;
  for (const key of path) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      node = node[key];
    } else {
      return undefined;
    }
  }
  return node;
}

// Determine what the children of a node are
function getChildren(node: any): { type: 'categories' | 'finalItems' | 'empty'; items: string[] } {
  if (node === undefined || node === null) {
    return { type: 'empty', items: [] };
  }
  if (Array.isArray(node)) {
    return { type: 'finalItems', items: node };
  }
  if (typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 0) {
      return { type: 'empty', items: [] };
    }
    return { type: 'categories', items: keys };
  }
  return { type: 'empty', items: [] };
}

// Flatten the catalog tree into searchable entries
interface SearchEntry {
  name: string;
  path: string[];
  type: 'category' | 'item';
  fullPath: string; // for display
}

function flattenTree(node: any, currentPath: string[] = []): SearchEntry[] {
  const results: SearchEntry[] = [];
  if (!node || typeof node !== 'object') return results;

  if (Array.isArray(node)) {
    for (const item of node) {
      results.push({
        name: item,
        path: [...currentPath, item],
        type: 'item',
        fullPath: [...currentPath, item].join(' › '),
      });
    }
  } else {
    for (const key of Object.keys(node)) {
      results.push({
        name: key,
        path: [...currentPath, key],
        type: Array.isArray(node[key]) ? 'category' : 'category',
        fullPath: [...currentPath, key].join(' › '),
      });
      results.push(...flattenTree(node[key], [...currentPath, key]));
    }
  }

  return results;
}

// Generate a Firestore-safe document ID from a path array
function pathToDocId(pathArray: string[]): string {
  return pathArray.join('__').replace(/[\/\.]/g, '_');
}

interface StockAlert {
  path: string[];
  stock: number;
  itemName: string;
}

type StockFilter = 'all' | 'available' | 'low' | 'zero';

interface StockData {
  [docId: string]: { stock: number; path: string[] };
}

export default function HomeScreen() {
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [permissionError, setPermissionError] = useState<boolean>(false);
  const [path, setPath] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [allStockData, setAllStockData] = useState<StockData>({});
  const router = useRouter();
  const { userProfile, isAdmin, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      console.error('Error signing out:', e);
    }
  };

  // Seed catalog on first load + subscribe to real-time updates
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        await seedCatalog();
      } catch (e) {
        console.log('Seed error (may be permission):', e);
      }

      const treeRef = doc(db, 'catalog', 'tree');
      unsubscribe = onSnapshot(
        treeRef,
        (snapshot) => {
          if (snapshot.exists()) {
            setCatalogTree(snapshot.data() as Record<string, any>);
          } else {
            setCatalogTree({});
          }
          setPermissionError(false);
          setLoading(false);
        },
        (error: any) => {
          console.error('Error al sincronizar catálogo:', error);
          if (
            error?.code === 'permission-denied' ||
            String(error).includes('permissions')
          ) {
            setPermissionError(true);
          }
          setLoading(false);
        }
      );
    };

    init();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Subscribe to stock collection for low stock alerts + all stock data for filters
  useEffect(() => {
    const stockRef = collection(db, 'stock');
    const unsubscribe = onSnapshot(
      stockRef,
      (snapshot) => {
        const alerts: StockAlert[] = [];
        const stockMap: StockData = {};
        snapshot.docs.forEach((d) => {
          const data = d.data();
          if (data.path) {
            const key = data.path.join('__').replace(/[\/\.]/g, '_');
            stockMap[key] = { stock: data.stock || 0, path: data.path };
          }
          if (data.stock !== undefined && data.stock <= 5) {
            alerts.push({
              path: data.path || [],
              stock: data.stock,
              itemName: data.path ? data.path[data.path.length - 1] : d.id,
            });
          }
        });
        // Sort: zero stock first, then by stock ascending
        alerts.sort((a, b) => a.stock - b.stock);
        setStockAlerts(alerts);
        setAllStockData(stockMap);
      },
      (error) => {
        console.error('Error loading stock alerts:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Handle Android back button
  useEffect(() => {
    const backAction = () => {
      if (stockFilter !== 'all') {
        setStockFilter('all');
        return true;
      }
      if (searchQuery) {
        setSearchQuery('');
        return true;
      }
      if (path.length > 0) {
        setPath((prev) => prev.slice(0, -1));
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [path, searchQuery, stockFilter]);

  const onLayoutReady = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !catalogTree) return [];
    const allEntries = flattenTree(catalogTree);
    const q = searchQuery.toLowerCase().trim();
    return allEntries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(q) ||
        entry.fullPath.toLowerCase().includes(q)
    );
  }, [searchQuery, catalogTree]);

  // Stock-filtered items (flat list of all items matching the stock filter)
  const stockFilteredItems = useMemo(() => {
    if (stockFilter === 'all' || !catalogTree) return [];
    const allItems = flattenTree(catalogTree).filter((e) => e.type === 'item');
    return allItems.filter((entry) => {
      const docId = entry.path.join('__').replace(/[\/\.]/g, '_');
      const stockInfo = allStockData[docId];
      const currentStock = stockInfo?.stock ?? 0;
      switch (stockFilter) {
        case 'available': return currentStock > 5;
        case 'low': return currentStock > 0 && currentStock <= 5;
        case 'zero': return currentStock <= 0;
        default: return true;
      }
    });
  }, [stockFilter, catalogTree, allStockData]);

  const handleCategoryPress = (item: string) => {
    if (!catalogTree) return;

    const newPath = [...path, item];
    const node = getNodeAtPath(catalogTree, newPath);
    const childrenResult = getChildren(node);

    if (childrenResult.type === 'finalItems' && childrenResult.items.length > 0) {
      setPath(newPath);
    } else if (childrenResult.type === 'categories') {
      setPath(newPath);
    } else if (childrenResult.type === 'empty' && typeof node === 'object' && !Array.isArray(node)) {
      setPath(newPath);
    } else {
      router.push({
        pathname: '/action',
        params: { path: JSON.stringify(newPath) },
      });
    }
  };

  const handleFinalItemPress = (item: string) => {
    const fullPath = [...path, item];
    router.push({
      pathname: '/action',
      params: { path: JSON.stringify(fullPath) },
    });
  };

  const handleSearchResultPress = (entry: SearchEntry) => {
    setSearchQuery('');
    if (entry.type === 'item') {
      // Navigate to the item's parent and let them click
      router.push({
        pathname: '/action',
        params: { path: JSON.stringify(entry.path) },
      });
    } else {
      // Navigate to this category
      setPath(entry.path);
    }
  };

  const goBack = () => {
    if (path.length > 0) {
      setPath((prev) => prev.slice(0, -1));
    }
  };

  const currentNode = catalogTree ? getNodeAtPath(catalogTree, path) : null;
  const children = getChildren(currentNode);
  const isRoot = path.length === 0;

  const getIcon = (item: string, depth: number) => {
    if (depth === 0) return CATEGORY_ICONS[item] || '📁';
    return '▸';
  };

  const zeroStockCount = stockAlerts.filter((a) => a.stock === 0).length;
  const lowStockCount = stockAlerts.filter((a) => a.stock > 0).length;

  const renderCategoryCard = ({ item, index }: { item: string; index: number }) => {
    const depth = path.length;
    const icon = getIcon(item, depth);
    const isFinalItem = children.type === 'finalItems';

    return (
      <TouchableOpacity
        style={[
          isFinalItem ? styles.finalItemCard : styles.categoryCard,
          isRoot && styles.categoryCardRoot,
          isTablet && !isFinalItem && styles.categoryCardTablet,
        ]}
        activeOpacity={0.7}
        onPress={() =>
          isFinalItem ? handleFinalItemPress(item) : handleCategoryPress(item)
        }
      >
        {!isFinalItem && (
          <Text style={[styles.categoryIcon, isRoot && styles.categoryIconRoot]}>
            {icon}
          </Text>
        )}
        <Text
          style={[
            isFinalItem ? styles.finalItemText : styles.categoryName,
            isRoot && !isFinalItem && styles.categoryNameRoot,
          ]}
          numberOfLines={2}
        >
          {item}
        </Text>
        {!isFinalItem && (
          <Text style={styles.chevron}>›</Text>
        )}
        {isFinalItem && (
          <View style={styles.actionHint}>
            <Text style={styles.actionHintText}>Retirar / Devolver</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const isSearching = searchQuery.trim().length > 0;
  const isStockFiltering = stockFilter !== 'all';

  return (
    <SafeAreaView style={styles.container} onLayout={onLayoutReady}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {!isRoot && !isSearching ? (
            <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>← Atrás</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={styles.headerIcon}>⚡</Text>
              <View>
                <Text style={styles.headerTitle}>Andpatelec</Text>
                <Text style={styles.headerSubtitle}>
                  {userProfile ? `Hola, ${userProfile.displayName.split(' ')[0]}` : 'Gestión de Materiales'}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar artículos, categorías..."
          placeholderTextColor="#484f58"
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            if (text.trim()) setPath([]); // reset path when searching
          }}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
            <Text style={styles.searchClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stock Availability Filters */}
      {isRoot && !isSearching && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.stockFilterScroll}
          contentContainerStyle={styles.stockFilterContent}
        >
          {([
            { key: 'all' as StockFilter, label: '📦 Todos' },
            { key: 'available' as StockFilter, label: '🟢 Disponible' },
            { key: 'low' as StockFilter, label: '🟡 Stock bajo' },
            { key: 'zero' as StockFilter, label: '🔴 Sin stock' },
          ]).map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.stockFilterChip,
                stockFilter === filter.key && styles.stockFilterChipActive,
              ]}
              onPress={() => setStockFilter(filter.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.stockFilterText,
                  stockFilter === filter.key && styles.stockFilterTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Stock Alerts Banner */}
      {stockAlerts.length > 0 && isRoot && !isSearching && (
        <TouchableOpacity
          style={styles.alertBanner}
          onPress={() => setShowAlerts(!showAlerts)}
          activeOpacity={0.8}
        >
          <View style={styles.alertBannerContent}>
            <Text style={styles.alertBannerIcon}>
              {zeroStockCount > 0 ? '🔴' : '🟡'}
            </Text>
            <Text style={styles.alertBannerText}>
              {zeroStockCount > 0
                ? `${zeroStockCount} sin stock`
                : ''}
              {zeroStockCount > 0 && lowStockCount > 0 ? ' · ' : ''}
              {lowStockCount > 0
                ? `${lowStockCount} stock bajo`
                : ''}
            </Text>
            <Text style={styles.alertBannerArrow}>
              {showAlerts ? '▲' : '▼'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Expanded Alerts */}
      {showAlerts && isRoot && !isSearching && (
        <ScrollView style={styles.alertList} nestedScrollEnabled>
          {stockAlerts.map((alert, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.alertItem}
              onPress={() => {
                setShowAlerts(false);
                router.push({
                  pathname: '/action',
                  params: { path: JSON.stringify(alert.path) },
                });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.alertItemIcon}>
                {alert.stock === 0 ? '🔴' : '🟡'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertItemName}>{alert.itemName}</Text>
                <Text style={styles.alertItemPath}>
                  {alert.path.slice(0, -1).join(' › ')}
                </Text>
              </View>
              <Text style={[
                styles.alertItemStock,
                alert.stock === 0 ? styles.stockZero : styles.stockLow,
              ]}>
                {alert.stock}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Search Results */}
      {isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item, idx) => item.fullPath + idx}
          contentContainerStyle={styles.searchResultsList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.searchResultsHeader}>
              {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para "{searchQuery}"
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyText}>
                No se encontraron artículos ni categorías con ese nombre.
              </Text>
            </View>
          }
          renderItem={({ item: entry }) => (
            <TouchableOpacity
              style={styles.searchResultItem}
              onPress={() => handleSearchResultPress(entry)}
              activeOpacity={0.7}
            >
              <Text style={styles.searchResultIcon}>
                {entry.type === 'category' ? '📁' : '📄'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.searchResultName}>{entry.name}</Text>
                <Text style={styles.searchResultPath}>{entry.fullPath}</Text>
              </View>
              <View style={[
                styles.searchResultBadge,
                entry.type === 'item' ? styles.searchBadgeItem : styles.searchBadgeCategory,
              ]}>
                <Text style={styles.searchResultBadgeText}>
                  {entry.type === 'item' ? 'Artículo' : 'Carpeta'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : isStockFiltering ? (
        /* Stock-filtered flat list */
        <FlatList
          data={stockFilteredItems}
          keyExtractor={(item, idx) => item.fullPath + idx}
          contentContainerStyle={styles.searchResultsList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.searchResultsHeader}>
              {stockFilteredItems.length} ítem{stockFilteredItems.length !== 1 ? 's' : ''}
              {stockFilter === 'available' ? ' disponibles' : stockFilter === 'low' ? ' con stock bajo' : ' sin stock'}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>
                {stockFilter === 'zero' ? '✅' : '📦'}
              </Text>
              <Text style={styles.emptyTitle}>
                {stockFilter === 'zero' ? '¡Todo en stock!' : 'Sin resultados'}
              </Text>
              <Text style={styles.emptyText}>
                {stockFilter === 'zero'
                  ? 'No hay ítems sin stock.'
                  : 'No se encontraron ítems con ese filtro.'}
              </Text>
            </View>
          }
          renderItem={({ item: entry }) => {
            const docId = entry.path.join('__').replace(/[\/\.]/g, '_');
            const stockInfo = allStockData[docId];
            const currentStock = stockInfo?.stock ?? 0;
            return (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => {
                  router.push({
                    pathname: '/action',
                    params: { path: JSON.stringify(entry.path) },
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.searchResultIcon}>
                  {currentStock <= 0 ? '🔴' : currentStock <= 5 ? '🟡' : '🟢'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultName}>{entry.name}</Text>
                  <Text style={styles.searchResultPath}>{entry.fullPath}</Text>
                </View>
                <Text style={[
                  styles.stockFilterBadgeNum,
                  currentStock <= 0 ? { color: '#f85149' } : currentStock <= 5 ? { color: '#d29922' } : { color: '#3fb950' },
                ]}>
                  {currentStock}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <>
          {/* Breadcrumb */}
          {!isRoot && (
            <View style={styles.breadcrumbContainer}>
              <TouchableOpacity onPress={() => setPath([])}>
                <Text style={styles.breadcrumbLink}>Inicio</Text>
              </TouchableOpacity>
              {path.map((segment, i) => (
                <React.Fragment key={i}>
                  <Text style={styles.breadcrumbSeparator}> › </Text>
                  <TouchableOpacity
                    onPress={() => setPath(path.slice(0, i + 1))}
                    disabled={i === path.length - 1}
                  >
                    <Text
                      style={[
                        styles.breadcrumbLink,
                        i === path.length - 1 && styles.breadcrumbActive,
                      ]}
                    >
                      {segment}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          )}

          {/* Current level title */}
          {!isRoot && (
            <View style={styles.levelTitleContainer}>
              <Text style={styles.levelTitle}>{path[path.length - 1]}</Text>
              <Text style={styles.levelCount}>
                {children.items.length} {children.type === 'finalItems' ? 'ítems' : 'subcategorías'}
              </Text>
            </View>
          )}

          {/* Main Content */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#00e5ff" />
              <Text style={styles.loadingText}>Cargando catálogo...</Text>
            </View>
          ) : permissionError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorCardTitle}>⚠️ Error de Permisos en Firebase</Text>
              <Text style={styles.errorCardText}>
                Firebase rechazó el acceso. Verificá las Reglas de Seguridad de Firestore.
              </Text>
            </View>
          ) : children.items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>
                {isRoot ? 'Catálogo vacío' : 'Sin ítems en esta categoría'}
              </Text>
              <Text style={styles.emptyText}>
                Un administrador puede agregar categorías desde el panel de admin (⚙️).
              </Text>
            </View>
          ) : (
            <FlatList
              data={children.items}
              keyExtractor={(item) => item}
              numColumns={isTablet ? 3 : 2}
              key={isTablet ? 'grid-tablet' : 'grid-phone'}
              contentContainerStyle={styles.listContent}
              columnWrapperStyle={styles.columnWrapper}
              showsVerticalScrollIndicator={false}
              renderItem={renderCategoryCard}
            />
          )}
        </>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f0f6fc',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8b949e',
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: '#58a6ff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButtons: {
    display: 'none',
  },

  // Search bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f0f6fc',
    fontSize: 14,
    paddingVertical: 10,
  },
  searchClear: {
    padding: 6,
  },
  searchClearText: {
    color: '#8b949e',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Stock alerts
  alertBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#2d1215',
    borderColor: '#f8514940',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  alertBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  alertBannerIcon: {
    fontSize: 16,
  },
  alertBannerText: {
    color: '#f0f6fc',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  alertBannerArrow: {
    color: '#8b949e',
    fontSize: 12,
  },
  alertList: {
    maxHeight: 200,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    gap: 10,
  },
  alertItemIcon: {
    fontSize: 14,
  },
  alertItemName: {
    color: '#f0f6fc',
    fontSize: 13,
    fontWeight: '600',
  },
  alertItemPath: {
    color: '#8b949e',
    fontSize: 11,
  },
  alertItemStock: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 30,
    textAlign: 'center',
  },
  stockZero: {
    color: '#f85149',
  },
  stockLow: {
    color: '#d29922',
  },

  // Search results
  searchResultsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  searchResultsHeader: {
    color: '#8b949e',
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '500',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  searchResultIcon: {
    fontSize: 22,
  },
  searchResultName: {
    color: '#f0f6fc',
    fontSize: 15,
    fontWeight: '600',
  },
  searchResultPath: {
    color: '#58a6ff',
    fontSize: 11,
    marginTop: 2,
  },
  searchResultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  searchBadgeItem: {
    backgroundColor: '#1f3a5f',
  },
  searchBadgeCategory: {
    backgroundColor: '#21262d',
  },
  searchResultBadgeText: {
    color: '#f0f6fc',
    fontSize: 10,
    fontWeight: '600',
  },

  // Breadcrumb
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  breadcrumbLink: {
    color: '#58a6ff',
    fontSize: 13,
    fontWeight: '500',
  },
  breadcrumbActive: {
    color: '#f0f6fc',
    fontWeight: 'bold',
  },
  breadcrumbSeparator: {
    color: '#484f58',
    fontSize: 13,
  },

  // Level title
  levelTitleContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    marginBottom: 10,
  },
  levelTitle: {
    color: '#f0f6fc',
    fontSize: 24,
    fontWeight: 'bold',
  },
  levelCount: {
    color: '#8b949e',
    fontSize: 13,
    marginTop: 2,
  },

  // Category cards
  categoryCard: {
    flex: 1,
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryCardRoot: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
    padding: 16,
    gap: 10,
  },
  categoryCardTablet: {
    aspectRatio: undefined,
  },
  categoryIcon: {
    fontSize: 18,
  },
  categoryIconRoot: {
    fontSize: 42,
  },
  categoryName: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  categoryNameRoot: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 0,
  },
  chevron: {
    color: '#484f58',
    fontSize: 20,
    fontWeight: 'bold',
  },

  // Final item cards
  finalItemCard: {
    flex: 1,
    backgroundColor: '#161b22',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  finalItemText: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  actionHint: {
    backgroundColor: '#1f3a5f',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionHintText: {
    color: '#58a6ff',
    fontSize: 10,
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  columnWrapper: {
    gap: 10,
  },

  // Loading / Error / Empty
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
  errorCard: {
    backgroundColor: '#161b22',
    borderColor: '#f85149',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  errorCardTitle: {
    color: '#f85149',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorCardText: {
    color: '#c9d1d9',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    textAlign: 'center',
  },
  emptyText: {
    color: '#8b949e',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // Stock availability filters
  stockFilterScroll: {
    maxHeight: 44,
    marginBottom: 10,
  },
  stockFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  stockFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  stockFilterChipActive: {
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
  },
  stockFilterText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  stockFilterTextActive: {
    color: '#f0f6fc',
  },
  stockFilterBadgeNum: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 30,
    textAlign: 'center',
  },
});
