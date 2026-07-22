import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// Generate a Firestore-safe document ID from a path array
function pathToDocId(pathArray: string[]): string {
  return pathArray.join('__').replace(/[\/\.]/g, '_');
}

export default function ActionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path: string }>();
  const itemPath: string[] = params.path ? JSON.parse(params.path) : [];

  const [stock, setStock] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const docId = pathToDocId(itemPath);
  const itemName = itemPath[itemPath.length - 1] || 'Ítem';
  const categoryPath = itemPath.slice(0, -1).join(' › ');

  // Subscribe to real-time stock updates
  useEffect(() => {
    if (!docId) return;

    const stockRef = doc(db, 'stock', docId);
    const unsubscribe = onSnapshot(
      stockRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setStock(snapshot.data().stock || 0);
        } else {
          setStock(0);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error loading stock:', error);
        setStock(0);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [docId]);

  const handleAction = async (action: 'retirar' | 'devolver') => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }

    if (action === 'retirar' && qty > stock) {
      Alert.alert(
        'Stock insuficiente',
        `Solo hay ${stock} unidades disponibles. No podés retirar ${qty}.`
      );
      return;
    }

    try {
      setSubmitting(true);

      const newStock = action === 'retirar' ? stock - qty : stock + qty;

      // Update stock document
      const stockRef = doc(db, 'stock', docId);
      await setDoc(
        stockRef,
        {
          path: itemPath,
          stock: newStock,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      // Log the movement
      await addDoc(collection(db, 'movements'), {
        path: itemPath,
        action,
        quantity: qty,
        stockBefore: stock,
        stockAfter: newStock,
        notes: notes.trim(),
        timestamp: serverTimestamp(),
      });

      const emoji = action === 'retirar' ? '📤' : '📥';
      const verb = action === 'retirar' ? 'Retirado' : 'Devuelto';
      Alert.alert(
        `${emoji} ${verb}`,
        `${qty} unidad${qty > 1 ? 'es' : ''} de ${itemName}.\nStock actual: ${newStock}`,
        [{ text: 'OK' }]
      );

      setQuantity('1');
      setNotes('');
    } catch (error) {
      console.error('Error registrando movimiento:', error);
      Alert.alert('Error', 'No se pudo registrar el movimiento.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStockColor = (s: number) => {
    if (s <= 0) return '#f85149';
    if (s <= 5) return '#d29922';
    return '#3fb950';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#00e5ff" />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Atrás</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {itemName}
        </Text>
        <View style={{ width: 70 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Path breadcrumb */}
          <View style={styles.pathContainer}>
            <Text style={styles.pathLabel}>📍 Ubicación</Text>
            <Text style={styles.pathText}>{itemPath.join(' › ')}</Text>
          </View>

          {/* Stock display */}
          <View style={styles.stockCard}>
            <Text style={styles.stockLabel}>Stock actual</Text>
            <Text style={[styles.stockNumber, { color: getStockColor(stock) }]}>
              {stock}
            </Text>
            <Text style={styles.stockUnit}>unidades</Text>
          </View>

          {/* Quantity input */}
          <View style={styles.quantitySection}>
            <Text style={styles.label}>Cantidad</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => {
                  const q = Math.max(1, parseInt(quantity, 10) - 1 || 1);
                  setQuantity(String(q));
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.quantityBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.quantityInput}
                value={quantity}
                onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                textAlign="center"
              />
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => {
                  const q = (parseInt(quantity, 10) || 0) + 1;
                  setQuantity(String(q));
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.quantityBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notes */}
          <Text style={styles.label}>Notas (opcional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Ej: Para obra calle 10..."
            placeholderTextColor="#484f58"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.btnRetirar, submitting && styles.btnDisabled]}
              onPress={() => handleAction('retirar')}
              disabled={submitting || stock <= 0}
              activeOpacity={0.7}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.btnActionIcon}>📤</Text>
                  <Text style={styles.btnActionText}>Retirar</Text>
                  <Text style={styles.btnActionSub}>
                    −{parseInt(quantity, 10) || 0} unidades
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnDevolver, submitting && styles.btnDisabled]}
              onPress={() => handleAction('devolver')}
              disabled={submitting}
              activeOpacity={0.7}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.btnActionIcon}>📥</Text>
                  <Text style={styles.btnActionText}>Devolver</Text>
                  <Text style={styles.btnActionSub}>
                    +{parseInt(quantity, 10) || 0} unidades
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Path
  pathContainer: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  pathLabel: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  pathText: {
    color: '#58a6ff',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },

  // Stock card
  stockCard: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  stockLabel: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  stockNumber: {
    fontSize: 56,
    fontWeight: 'bold',
  },
  stockUnit: {
    color: '#8b949e',
    fontSize: 14,
    marginTop: 4,
  },

  // Quantity
  quantitySection: {
    marginBottom: 16,
  },
  label: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityBtnText: {
    color: '#f0f6fc',
    fontSize: 24,
    fontWeight: 'bold',
  },
  quantityInput: {
    flex: 1,
    backgroundColor: '#161b22',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: 'bold',
  },

  // Notes
  notesInput: {
    backgroundColor: '#161b22',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 24,
    fontSize: 14,
    minHeight: 60,
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  btnRetirar: {
    flex: 1,
    backgroundColor: '#b33a2a',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#f85149',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  btnDevolver: {
    flex: 1,
    backgroundColor: '#1a7f37',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#3fb950',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnActionIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  btnActionText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  btnActionSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },

  // Loading
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
});
