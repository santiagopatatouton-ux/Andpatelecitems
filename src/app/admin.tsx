import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../utils/auth-context';

export default function AdminScreen() {
  const router = useRouter();
  const { userProfile, isAdmin } = useAuth();
  
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<string[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [addingAs, setAddingAs] = useState<'subcategory' | 'item'>('item');
  const [saving, setSaving] = useState(false);

  // Authorization check
  const isAuthorized = isAdmin || userProfile?.canEditCatalog;

  useEffect(() => {
    if (!isAuthorized && !loading) {
      Alert.alert('Acceso Denegado', 'No tenés permisos para editar el catálogo.');
      if (router.canGoBack()) router.back(); else router.replace('/');
      return;
    }

    const treeRef = doc(db, 'catalog', 'tree');
    const unsubscribe = onSnapshot(
      treeRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setCatalogTree(snapshot.data() as Record<string, any>);
        } else {
          setCatalogTree({});
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error cargando catálogo:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAuthorized]);

  const getNodeAtPath = (tree: Record<string, any>, p: string[]): any => {
    let node: any = tree;
    for (const key of p) {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        node = node[key];
      } else {
        return undefined;
      }
    }
    return node;
  };

  const getChildren = (node: any): { type: 'categories' | 'finalItems' | 'empty'; items: string[] } => {
    if (node === undefined || node === null) return { type: 'empty', items: [] };
    if (Array.isArray(node)) return { type: 'finalItems', items: node };
    if (typeof node === 'object') {
      const keys = Object.keys(node);
      if (keys.length === 0) return { type: 'empty', items: [] };
      return { type: 'categories', items: keys };
    }
    return { type: 'empty', items: [] };
  };

  const currentNode = catalogTree ? getNodeAtPath(catalogTree, path) : null;
  const children = getChildren(currentNode);
  const isRoot = path.length === 0;

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Campo vacío', 'Ingresá un nombre para el nuevo elemento.');
      return;
    }

    const name = newItemName.trim();

    try {
      setSaving(true);
      const treeRef = doc(db, 'catalog', 'tree');

      const snapshot = await getDoc(treeRef);
      const fullTree = snapshot.exists() ? { ...snapshot.data() } : {};

      if (path.length === 0) {
        if (addingAs === 'subcategory') {
          fullTree[name] = {};
        } else {
          Alert.alert('Error', 'No se pueden agregar ítems finales en el nivel raíz. Agregá una subcategoría.');
          setSaving(false);
          return;
        }
      } else {
        let parent: any = fullTree;
        for (let i = 0; i < path.length - 1; i++) {
          parent = parent[path[i]];
        }
        const lastKey = path[path.length - 1];
        let target = parent[lastKey];

        if (Array.isArray(target)) {
          if (addingAs === 'subcategory') {
            const newObj: Record<string, any> = {};
            for (const existingItem of target) {
              newObj[existingItem] = [];
            }
            newObj[name] = {};
            parent[lastKey] = newObj;
          } else {
            if (target.includes(name)) {
              Alert.alert('Duplicado', `"${name}" ya existe en esta categoría.`);
              setSaving(false);
              return;
            }
            target.push(name);
          }
        } else if (typeof target === 'object' && target !== null) {
          if (target[name] !== undefined) {
            Alert.alert('Duplicado', `"${name}" ya existe en esta categoría.`);
            setSaving(false);
            return;
          }
          if (addingAs === 'subcategory') {
            target[name] = {};
          } else {
            target[name] = [];
          }
        }
      }

      await setDoc(treeRef, fullTree);
      setNewItemName('');
      Alert.alert('✅ Agregado', `"${name}" se agregó correctamente.`);
    } catch (error) {
      console.error('Error agregando:', error);
      Alert.alert('Error', 'No se pudo agregar el elemento.');
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async (itemName: string) => {
    try {
      setSaving(true);
      const treeRef = doc(db, 'catalog', 'tree');
      const snapshot = await getDoc(treeRef);
      const fullTree = snapshot.exists() ? { ...snapshot.data() } : {};

      if (path.length === 0) {
        delete fullTree[itemName];
      } else {
        let parent: any = fullTree;
        for (let i = 0; i < path.length - 1; i++) {
          parent = parent[path[i]];
        }
        const lastKey = path[path.length - 1];
        let target = parent[lastKey];

        if (Array.isArray(target)) {
          parent[lastKey] = target.filter((i: string) => i !== itemName);
        } else if (typeof target === 'object') {
          delete target[itemName];
        }
      }

      await setDoc(treeRef, fullTree);
      if (Platform.OS !== 'web') {
        Alert.alert('🗑️ Eliminado', `"${itemName}" fue eliminado.`);
      }
    } catch (error) {
      console.error('Error eliminando:', error);
      Alert.alert('Error', 'No se pudo eliminar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = (itemName: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`¿Seguro que querés eliminar "${itemName}" y todo su contenido?`);
      if (confirmed) {
        executeDelete(itemName);
      }
    } else {
      Alert.alert(
        'Eliminar',
        `¿Seguro que querés eliminar "${itemName}" y todo su contenido?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => executeDelete(itemName),
          },
        ]
      );
    }
  };

  if (!isAuthorized) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (path.length > 0) {
              setPath((prev) => prev.slice(0, -1));
            } else {
              if (router.canGoBack()) router.back(); else router.replace('/');
            }
          }}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>
            {path.length > 0 ? '← Atrás' : '← Volver'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ Admin Catálogo</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Admin actions (only for main admin) */}
      {isAdmin && isRoot && (
        <View style={styles.adminActionsBar}>
          <Text style={styles.adminPanelTitle}>Panel de Control</Text>
          <View style={styles.adminActionGrid}>
            <TouchableOpacity 
              style={styles.adminActionBtn} 
              onPress={() => router.push('/user-management')}
            >
              <Text style={styles.adminActionIcon}>👥</Text>
              <Text style={styles.adminActionText}>Usuarios</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.adminActionBtn, { borderColor: '#d29922' }]} 
              onPress={() => router.push('/requests')}
            >
              <Text style={styles.adminActionIcon}>🛒</Text>
              <Text style={styles.adminActionText}>Solicitudes</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.adminActionBtn, { borderColor: '#3fb950' }]} 
              onPress={() => router.push('/dashboard')}
            >
              <Text style={styles.adminActionIcon}>📊</Text>
              <Text style={styles.adminActionText}>Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isRoot && (
        <View style={styles.breadcrumbContainer}>
          <TouchableOpacity onPress={() => setPath([])}>
            <Text style={styles.breadcrumbLink}>Raíz</Text>
          </TouchableOpacity>
          {path.map((segment, i) => (
            <React.Fragment key={i}>
              <Text style={styles.breadcrumbSeparator}> › </Text>
              <TouchableOpacity
                onPress={() => setPath(path.slice(0, i + 1))}
                disabled={i === path.length - 1}
              >
                <Text style={[styles.breadcrumbLink, i === path.length - 1 && styles.breadcrumbActive]}>
                  {segment}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#00e5ff" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle}>
              {isRoot ? 'Categorías principales' : `Contenido de "${path[path.length - 1]}"`}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {children.items.length === 0
                ? 'Vacío — agregá elementos abajo'
                : `${children.items.length} elemento${children.items.length !== 1 ? 's' : ''}`}
            </Text>

            {children.items.map((item) => {
              const isCategory = children.type === 'categories';
              const childNode = isCategory ? currentNode[item] : null;
              const childIsObject = childNode && typeof childNode === 'object' && !Array.isArray(childNode);
              const childCount = childNode
                ? Array.isArray(childNode)
                  ? childNode.length
                  : typeof childNode === 'object'
                  ? Object.keys(childNode).length
                  : 0
                : 0;

              return (
                <View key={item} style={styles.itemRow}>
                  <TouchableOpacity
                    style={styles.itemRowContent}
                    onPress={() => { if (isCategory) setPath([...path, item]); }}
                    activeOpacity={isCategory ? 0.7 : 1}
                  >
                    <Text style={styles.itemRowIcon}>
                      {isCategory ? '📁' : '📄'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemRowName}>{item}</Text>
                      {isCategory && (
                        <Text style={styles.itemRowSub}>
                          {childCount} elemento{childCount !== 1 ? 's' : ''} •{' '}
                          {childIsObject ? 'subcategoría' : 'ítems'}
                        </Text>
                      )}
                    </View>
                    {isCategory && <Text style={styles.chevron}>›</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteItem(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            <View style={styles.addSection}>
              <Text style={styles.addTitle}>➕ Agregar nuevo</Text>

              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, addingAs === 'subcategory' && styles.typeBtnActive]}
                  onPress={() => setAddingAs('subcategory')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeBtnText, addingAs === 'subcategory' && styles.typeBtnTextActive]}>
                    📁 Subcategoría
                  </Text>
                </TouchableOpacity>
                {!isRoot && (
                  <TouchableOpacity
                    style={[styles.typeBtn, addingAs === 'item' && styles.typeBtnActive]}
                    onPress={() => setAddingAs('item')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.typeBtnText, addingAs === 'item' && styles.typeBtnTextActive]}>
                      📄 Ítem final
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.addInput}
                value={newItemName}
                onChangeText={setNewItemName}
                placeholder={addingAs === 'subcategory' ? 'Nombre de la subcategoría...' : 'Nombre del ítem final...'}
                placeholderTextColor="#484f58"
              />

              <TouchableOpacity
                style={[styles.addBtn, saving && styles.btnDisabled]}
                onPress={handleAddItem}
                disabled={saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.addBtnText}>Agregar</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  
  adminActionsBar: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#30363d', backgroundColor: '#0d1117' },
  adminPanelTitle: { color: '#8b949e', fontSize: 13, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 12 },
  adminActionGrid: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  adminActionBtn: { flex: 1, backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  adminActionIcon: { fontSize: 24, marginBottom: 6 },
  adminActionText: { color: '#f0f6fc', fontSize: 12, fontWeight: '600' },

  breadcrumbContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: '#21262d' },
  breadcrumbLink: { color: '#58a6ff', fontSize: 13, fontWeight: '500' },
  breadcrumbActive: { color: '#f0f6fc', fontWeight: 'bold' },
  breadcrumbSeparator: { color: '#484f58', fontSize: 13 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { color: '#f0f6fc', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  sectionSubtitle: { color: '#8b949e', fontSize: 13, marginBottom: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1, borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  itemRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemRowIcon: { fontSize: 20 },
  itemRowName: { color: '#f0f6fc', fontSize: 15, fontWeight: '600' },
  itemRowSub: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  chevron: { color: '#484f58', fontSize: 22, fontWeight: 'bold' },
  deleteBtn: { padding: 14, borderLeftWidth: 1, borderLeftColor: '#30363d' },
  deleteBtnText: { fontSize: 18 },
  addSection: { marginTop: 20, backgroundColor: '#161b22', borderColor: '#1f6feb', borderWidth: 1, borderRadius: 14, padding: 16 },
  addTitle: { color: '#f0f6fc', fontSize: 16, fontWeight: 'bold', marginBottom: 14 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: { flex: 1, backgroundColor: '#0d1117', borderColor: '#30363d', borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#1f3a5f', borderColor: '#1f6feb' },
  typeBtnText: { color: '#8b949e', fontSize: 13, fontWeight: '600' },
  typeBtnTextActive: { color: '#58a6ff' },
  addInput: { backgroundColor: '#0d1117', color: '#f0f6fc', borderColor: '#30363d', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  addBtn: { backgroundColor: '#238636', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
