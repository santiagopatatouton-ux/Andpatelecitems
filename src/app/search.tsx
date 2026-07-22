import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface CatalogItem {
  id: string; // Document ID format
  name: string;
  path: string[];
  stock: number;
}

function normalizeItemName(name: string): string {
  if (!name) return 'unknown_item';
  return name.trim().toLowerCase().replace(/[\/\.]/g, '_');
}

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
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
      const smap: Record<string, number> = {};
      snapshot.forEach(doc => {
        smap[doc.id] = doc.data().stock || 0;
      });
      setStockMap(smap);
    });

    return () => {
      unsubTree();
      unsubStock();
    };
  }, []);

  // Flatten catalog tree into a list of items
  const allItems = useMemo(() => {
    if (!catalogTree) return [];
    
    const itemsList: CatalogItem[] = [];
    
    const traverse = (node: any, currentPath: string[]) => {
      if (node === undefined || node === null) return;
      
      if (Array.isArray(node)) {
        // These are final items
        node.forEach(itemName => {
          const fullPath = [...currentPath, itemName];
          const docId = normalizeItemName(itemName);
          itemsList.push({
            id: docId,
            name: itemName,
            path: fullPath,
            stock: stockMap[docId] || 0
          });
        });
      } else if (typeof node === 'object') {
        Object.keys(node).forEach(key => {
          traverse(node[key], [...currentPath, key]);
        });
      }
    };
    
    traverse(catalogTree, []);
    return itemsList;
  }, [catalogTree, stockMap]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase().trim();
    return allItems.filter(item => 
      item.name.toLowerCase().includes(query) || 
      item.path.some(p => p.toLowerCase().includes(query))
    );
  }, [searchQuery, allItems]);

  const handleItemPress = (item: CatalogItem) => {
    router.push({
      pathname: '/action',
      params: { path: JSON.stringify(item.path) }
    });
  };

  const renderItem = ({ item }: { item: CatalogItem }) => {
    let stockColor = '#3fb950';
    if (item.stock === 0) stockColor = '#f85149';
    else if (item.stock <= 5) stockColor = '#d29922';

    return (
      <TouchableOpacity 
        style={styles.resultCard}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.resultInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemPath}>{item.path.slice(0, -1).join(' › ')}</Text>
        </View>
        <View style={styles.stockBadge}>
          <Text style={[styles.stockText, { color: stockColor }]}>
            Stock: {item.stock}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Búsqueda</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar producto, categoría..."
          placeholderTextColor="#8b949e"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#00e5ff" />
          </View>
        ) : searchQuery.trim() === '' ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyIcon}>⌨️</Text>
            <Text style={styles.emptyText}>Escribí para buscar productos en el catálogo</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyIcon}>🤷</Text>
            <Text style={styles.emptyText}>No se encontraron resultados para "{searchQuery}"</Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>
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
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    backgroundColor: '#161b22',
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: '#58a6ff',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  searchIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#161b22',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#8b949e',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  listContent: {
    padding: 16,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  resultInfo: {
    flex: 1,
    paddingRight: 12,
  },
  itemName: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  itemPath: {
    color: '#8b949e',
    fontSize: 12,
  },
  stockBadge: {
    backgroundColor: '#0d1117',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 12,
  },
  stockText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  chevron: {
    color: '#484f58',
    fontSize: 24,
    fontWeight: 'bold',
  },
});
