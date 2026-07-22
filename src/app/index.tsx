import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { seedCatalog } from '../utils/seed-catalog';
import { CATEGORY_ICONS } from '../utils/catalog-data';
import { useAuth } from '../utils/auth-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 600;

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

function getChildren(node: any): { type: 'categories' | 'finalItems' | 'empty'; items: string[] } {
  if (node === undefined || node === null) return { type: 'empty', items: [] };
  if (Array.isArray(node)) return { type: 'finalItems', items: node };
  if (typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 0) return { type: 'empty', items: [] };
    return { type: 'categories', items: keys };
  }
  return { type: 'empty', items: [] };
}

function normalizeItemName(name: string): string {
  if (!name) return 'unknown_item';
  return name.trim().toLowerCase().replace(/[\/\.]/g, '_');
}

export default function HomeScreen() {
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [permissionError, setPermissionError] = useState<boolean>(false);
  const [path, setPath] = useState<string[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, {stock: number, minStock: number}>>({});
  const router = useRouter();
  const { userProfile, isAdmin, signOut } = useAuth();

  useEffect(() => {
    let unsubscribeTree: (() => void) | undefined;
    let unsubscribeStock: (() => void) | undefined;

    const init = async () => {
      try { await seedCatalog(); } catch (e) { console.log('Seed error:', e); }

      unsubscribeTree = onSnapshot(doc(db, 'catalog', 'tree'), 
        (snapshot) => {
          if (snapshot.exists()) setCatalogTree(snapshot.data() as Record<string, any>);
          else setCatalogTree({});
          setPermissionError(false);
          setLoading(false);
        },
        (error: any) => {
          if (error?.code === 'permission-denied') setPermissionError(true);
          setLoading(false);
        }
      );

      unsubscribeStock = onSnapshot(collection(db, 'stock'), (snapshot) => {
        const smap: Record<string, {stock: number, minStock: number}> = {};
        snapshot.forEach(doc => {
          const data = doc.data();
          smap[doc.id] = { stock: data.stock || 0, minStock: data.minStock ?? 5 };
        });
        setStockMap(smap);
      });
    };

    init();
    return () => {
      if (unsubscribeTree) unsubscribeTree();
      if (unsubscribeStock) unsubscribeStock();
    };
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (path.length > 0) {
        setPath((prev) => prev.slice(0, -1));
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [path]);

  const onLayoutReady = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  const handleCategoryPress = (item: string) => {
    if (!catalogTree) return;
    const newPath = [...path, item];
    const node = getNodeAtPath(catalogTree, newPath);
    const children = getChildren(node);

    if (children.type === 'finalItems' && children.items.length > 0) setPath(newPath);
    else if (children.type === 'categories') setPath(newPath);
    else if (children.type === 'empty' && typeof node === 'object' && !Array.isArray(node)) setPath(newPath);
    else router.push({ pathname: '/action', params: { path: JSON.stringify(newPath) } });
  };

  const handleFinalItemPress = (item: string) => {
    router.push({ pathname: '/action', params: { path: JSON.stringify([...path, item]) } });
  };

  const currentNode = catalogTree ? getNodeAtPath(catalogTree, path) : null;
  const children = getChildren(currentNode);
  const isRoot = path.length === 0;

  const lowStockCount = Object.values(stockMap).filter(s => s.stock <= s.minStock).length;

  const renderCategoryCard = ({ item }: { item: string }) => {
    const isFinalItem = children.type === 'finalItems';
    
    // Bug fix: dynamically check child type to show folder or document icon
    let icon = '📁';
    if (isRoot) icon = CATEGORY_ICONS[item] || '📁';
    else if (isFinalItem) icon = '📄';
    else {
      const childNode = currentNode ? currentNode[item] : null;
      if (Array.isArray(childNode)) icon = '📦'; // Subcategory holding final items
      else icon = '📁'; // Subcategory holding more subcategories
    }

    // Determine stock color if final item
    let stockColor = '#8b949e';
    let currentStock = 0;
    if (isFinalItem) {
      const docId = normalizeItemName(item);
      const itemData = stockMap[docId] || { stock: 0, minStock: 5 };
      currentStock = itemData.stock;
      if (currentStock === 0) stockColor = '#f85149';
      else if (currentStock <= itemData.minStock) stockColor = '#d29922';
      else stockColor = '#3fb950';
    }

    return (
      <TouchableOpacity
        style={[
          isFinalItem ? styles.finalItemCard : styles.categoryCard,
          isRoot && styles.categoryCardRoot,
          isTablet && !isFinalItem && styles.categoryCardTablet,
        ]}
        activeOpacity={0.7}
        onPress={() => isFinalItem ? handleFinalItemPress(item) : handleCategoryPress(item)}
      >
        {!isFinalItem && <Text style={[styles.categoryIcon, isRoot && styles.categoryIconRoot]}>{icon}</Text>}
        <View style={{ flex: 1 }}>
          <Text style={[isFinalItem ? styles.finalItemText : styles.categoryName, isRoot && !isFinalItem && styles.categoryNameRoot]} numberOfLines={2}>
            {item}
          </Text>
          {isFinalItem && (
            <Text style={[styles.stockText, { color: stockColor }]}>
              Stock: {currentStock}
            </Text>
          )}
        </View>
        {!isFinalItem && <Text style={styles.chevron}>›</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} onLayout={onLayoutReady}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {!isRoot ? (
            <TouchableOpacity onPress={() => setPath((prev) => prev.slice(0, -1))} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Atrás</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.userProfile}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{userProfile?.displayName?.[0]?.toUpperCase() || 'U'}</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>Andpatelec</Text>
                <Text style={styles.headerSubtitle}>{userProfile?.displayName || userProfile?.email}</Text>
              </View>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.btnLogout} onPress={signOut}>
          <Text style={styles.btnLogoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {!isRoot && (
        <View style={styles.breadcrumbContainer}>
          <TouchableOpacity onPress={() => setPath([])}><Text style={styles.breadcrumbLink}>Inicio</Text></TouchableOpacity>
          {path.map((segment, i) => (
            <React.Fragment key={i}>
              <Text style={styles.breadcrumbSeparator}> › </Text>
              <TouchableOpacity onPress={() => setPath(path.slice(0, i + 1))} disabled={i === path.length - 1}>
                <Text style={[styles.breadcrumbLink, i === path.length - 1 && styles.breadcrumbActive]}>{segment}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator size="large" color="#00e5ff" /></View>
      ) : permissionError ? (
        <View style={styles.errorCard}><Text style={styles.errorCardTitle}>⚠️ Error de Permisos</Text></View>
      ) : children.items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>{isRoot ? 'Catálogo vacío' : 'Sin ítems'}</Text>
        </View>
      ) : (
        <FlatList
          data={children.items}
          keyExtractor={(item) => item}
          numColumns={isTablet ? 3 : 2}
          key={isTablet ? 'grid-tablet' : 'grid-phone'}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={renderCategoryCard}
        />
      )}

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setPath([])}>
          <Text style={styles.navIcon}>🗂️</Text>
          <Text style={styles.navText}>Catálogo</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/search')}>
          <Text style={styles.navIcon}>🔍</Text>
          <Text style={styles.navText}>Buscar</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/alerts')}>
          <View>
            <Text style={styles.navIcon}>⚠️</Text>
            {lowStockCount > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{lowStockCount}</Text></View>
            )}
          </View>
          <Text style={styles.navText}>Alertas</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/history')}>
          <Text style={styles.navIcon}>📋</Text>
          <Text style={styles.navText}>Historial</Text>
        </TouchableOpacity>

        {(isAdmin || userProfile?.canEditCatalog) && (
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/admin')}>
            <Text style={styles.navIcon}>⚙️</Text>
            <Text style={styles.navText}>Admin</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#161b22', borderBottomWidth: 1, borderColor: '#30363d' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  userProfile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1f6feb', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#f0f6fc' },
  headerSubtitle: { fontSize: 12, color: '#8b949e' },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { color: '#58a6ff', fontSize: 16, fontWeight: '600' },
  btnLogout: { padding: 8, backgroundColor: '#21262d', borderRadius: 8 },
  btnLogoutText: { color: '#c9d1d9', fontSize: 13, fontWeight: '600' },
  
  breadcrumbContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#21262d', flexWrap: 'wrap' },
  breadcrumbLink: { color: '#58a6ff', fontSize: 13, fontWeight: '500' },
  breadcrumbActive: { color: '#f0f6fc', fontWeight: 'bold' },
  breadcrumbSeparator: { color: '#484f58', fontSize: 13 },
  
  categoryCard: { flex: 1, backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryCardRoot: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: 1, padding: 20 },
  categoryCardTablet: { aspectRatio: undefined },
  categoryIcon: { fontSize: 22 },
  categoryIconRoot: { fontSize: 40, marginBottom: 8 },
  categoryName: { color: '#f0f6fc', fontSize: 15, fontWeight: '600' },
  categoryNameRoot: { textAlign: 'center' },
  chevron: { color: '#484f58', fontSize: 20, fontWeight: 'bold' },
  
  finalItemCard: { flex: 1, backgroundColor: '#161b22', borderColor: '#1f6feb', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8 },
  finalItemText: { color: '#f0f6fc', fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  stockText: { fontSize: 13, fontWeight: '600' },
  
  listContent: { padding: 16, paddingBottom: 80 },
  columnWrapper: { gap: 10 },
  
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorCard: { margin: 16, padding: 16, backgroundColor: '#4a151b', borderRadius: 8 },
  errorCardTitle: { color: '#ff7b72', fontWeight: 'bold' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#f0f6fc', fontSize: 18, fontWeight: 'bold' },
  
  bottomNav: { flexDirection: 'row', backgroundColor: '#161b22', borderTopWidth: 1, borderColor: '#30363d', paddingBottom: Platform.OS === 'ios' ? 24 : 12, paddingTop: 12, justifyContent: 'space-around' },
  navItem: { alignItems: 'center', flex: 1 },
  navIcon: { fontSize: 22, marginBottom: 4 },
  navText: { color: '#8b949e', fontSize: 11, fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: '#f85149', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#161b22' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 4 }
});
