import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { seedCatalog } from '../utils/seed-catalog';
import { CATEGORY_ICONS } from '../utils/catalog-data';

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
// Returns: { type: 'categories', items: string[] } | { type: 'finalItems', items: string[] } | { type: 'empty' }
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

export default function HomeScreen() {
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [permissionError, setPermissionError] = useState<boolean>(false);
  const [path, setPath] = useState<string[]>([]); // current navigation path
  const router = useRouter();

  // Seed catalog on first load + subscribe to real-time updates
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        // Seed catalog if it doesn't exist
        await seedCatalog();
      } catch (e) {
        console.log('Seed error (may be permission):', e);
      }

      // Subscribe to real-time updates on catalog/tree
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

  // Handle Android back button: go up one level or double-press to exit
  useEffect(() => {
    const backAction = () => {
      if (path.length > 0) {
        setPath((prev) => prev.slice(0, -1));
        return true;
      }
      // At root, let default behavior happen (or exit)
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [path]);

  // Hide splash screen once content is ready
  const onLayoutReady = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  const handleCategoryPress = (item: string) => {
    if (!catalogTree) return;

    const newPath = [...path, item];
    const node = getNodeAtPath(catalogTree, newPath);
    const children = getChildren(node);

    if (children.type === 'finalItems' && children.items.length > 0) {
      // This node has an array of final items -> show them as next level
      setPath(newPath);
    } else if (children.type === 'categories') {
      // This node has sub-categories -> drill down
      setPath(newPath);
    } else if (children.type === 'empty' && typeof node === 'object' && !Array.isArray(node)) {
      // Empty category (like "Varios")
      setPath(newPath);
    } else {
      // This IS a final item (a string in an array) -> go to action screen
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

  const goBack = () => {
    if (path.length > 0) {
      setPath((prev) => prev.slice(0, -1));
    }
  };

  // Current node based on path
  const currentNode = catalogTree ? getNodeAtPath(catalogTree, path) : null;
  const children = getChildren(currentNode);
  const isRoot = path.length === 0;

  // Get icon for an item
  const getIcon = (item: string, depth: number) => {
    if (depth === 0) return CATEGORY_ICONS[item] || '📁';
    // Sub-levels
    return '▸';
  };

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

  return (
    <SafeAreaView style={styles.container} onLayout={onLayoutReady}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {!isRoot ? (
            <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>← Atrás</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={styles.headerIcon}>⚡</Text>
              <View>
                <Text style={styles.headerTitle}>Andpatelec</Text>
                <Text style={styles.headerSubtitle}>Gestión de Materiales</Text>
              </View>
            </>
          )}
        </View>
        {isRoot && (
          <TouchableOpacity
            style={styles.btnAdmin}
            onPress={() => router.push('/admin')}
            activeOpacity={0.7}
          >
            <Text style={styles.btnAdminText}>⚙️</Text>
          </TouchableOpacity>
        )}
      </View>

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
  btnAdmin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnAdminText: {
    fontSize: 20,
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

  // Category cards (root level - grid)
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
    aspectRatio: 1,
    padding: 20,
    gap: 10,
  },
  categoryCardTablet: {
    aspectRatio: undefined, // removed aspect ratio for non-root categories
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
});
