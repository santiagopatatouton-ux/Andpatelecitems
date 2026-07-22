import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface CatalogItem {
  id: string;
  name: string;
  path: string[];
  stock: number;
  minStock: number;
}

function normalizeItemName(name: string): string {
  if (!name) return 'unknown_item';
  return name.trim().toLowerCase().replace(/[\/\.]/g, '_');
}

export default function AlertsScreen() {
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, { stock: number, minStock: number }>>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Load catalog and stock
  useEffect(() => {
    const unsubTree = onSnapshot(doc(db, 'catalog', 'tree'), (snapshot) => {
      if (snapshot.exists()) {
        setCatalogTree(snapshot.data() as Record<string, any>);
      }
      setLoading(false);
    });

    const unsubStock = onSnapshot(collection(db, 'stock'), (snapshot) => {
      const smap: Record<string, { stock: number, minStock: number }> = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        smap[doc.id] = {
          stock: data.stock || 0,
          minStock: data.minStock ?? 5
        };
      });
      setStockMap(smap);
    });

    return () => {
      unsubTree();
      unsubStock();
    };
  }, []);

  // Find all items with low stock (<= minStock)
  const lowStockItems = useMemo(() => {
    if (!catalogTree) return [];
    
    const itemsList: CatalogItem[] = [];
    
    const traverse = (node: any, currentPath: string[]) => {
      if (node === undefined || node === null) return;
      
      if (Array.isArray(node)) {
        node.forEach(itemName => {
          const fullPath = [...currentPath, itemName];
          const docId = normalizeItemName(itemName);
          const itemData = stockMap[docId] || { stock: 0, minStock: 5 };
          
          if (itemData.stock <= itemData.minStock) {
            // Check if we already added this item
            if (!itemsList.find(i => i.id === docId)) {
              itemsList.push({ 
                id: docId, 
                name: itemName, 
                path: fullPath, 
                stock: itemData.stock,
                minStock: itemData.minStock
              });
            }
          }
        });
      } else if (typeof node === 'object') {
        Object.keys(node).forEach(key => {
          traverse(node[key], [...currentPath, key]);
        });
      }
    };
    
    traverse(catalogTree, []);
    
    // Sort by stock logic
    return itemsList.sort((a, b) => a.stock - b.stock);
  }, [catalogTree, stockMap]);

  const handleItemPress = (item: CatalogItem) => {
    router.push({
      pathname: '/action',
      params: { path: JSON.stringify(item.path) }
    });
  };

  const renderItem = ({ item }: { item: CatalogItem }) => {
    const isZero = item.stock <= 0;
    
    return (
      <TouchableOpacity 
        style={[styles.card, isZero ? styles.cardRed : styles.cardYellow]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.icon}>{isZero ? '🚨' : '⚠️'}</Text>
          <Text style={[styles.title, isZero ? styles.textRed : styles.textYellow]}>
            {isZero ? 'Sin stock' : 'Stock bajo'}
          </Text>
        </View>
        
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemPath}>{item.path.slice(0, -1).join(' › ')}</Text>
        
        <View style={styles.stockRow}>
          <Text style={styles.stockLabel}>Actual: {item.stock}</Text>
          <Text style={styles.minStockText}>Mínimo: {item.minStock}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alertas de Stock</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00e5ff" />
        </View>
      ) : lowStockItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>Todo en orden</Text>
          <Text style={styles.emptyText}>No hay productos con stock bajo en el catálogo.</Text>
        </View>
      ) : (
        <>
          <View style={styles.statsContainer}>
            <Text style={styles.statsText}>
              Hay {lowStockItems.length} producto{lowStockItems.length !== 1 ? 's' : ''} por debajo de su mínimo
            </Text>
          </View>
          <FlatList
            data={lowStockItems}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#21262d', backgroundColor: '#161b22' },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { color: '#58a6ff', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#f0f6fc', fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#f0f6fc', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptyText: { color: '#8b949e', fontSize: 15, textAlign: 'center' },
  statsContainer: { padding: 16, backgroundColor: '#161b22', borderBottomWidth: 1, borderBottomColor: '#30363d' },
  statsText: { color: '#c9d1d9', fontSize: 14, fontWeight: '500' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12, backgroundColor: '#161b22' },
  cardRed: { borderColor: '#f85149', borderLeftWidth: 4 },
  cardYellow: { borderColor: '#d29922', borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  icon: { fontSize: 16, marginRight: 8 },
  title: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase' },
  textRed: { color: '#f85149' },
  textYellow: { color: '#d29922' },
  itemName: { color: '#f0f6fc', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  itemPath: { color: '#8b949e', fontSize: 13, marginBottom: 12 },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0d1117', padding: 12, borderRadius: 8 },
  stockLabel: { color: '#f0f6fc', fontSize: 16, fontWeight: 'bold' },
  minStockText: { color: '#8b949e', fontSize: 14, fontWeight: '500' },
});
