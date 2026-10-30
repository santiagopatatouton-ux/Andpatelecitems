import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../context/auth-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CART_STORAGE_KEY = 'andpatelec_cart';

interface CartItem {
  path: string[];
  name: string;
  quantity: number;
}

export default function CartScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load cart from AsyncStorage
  const loadCart = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem(CART_STORAGE_KEY);
      const items: CartItem[] = json ? JSON.parse(json) : [];
      setCartItems(items);
    } catch (error) {
      console.error('Error loading cart:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload cart every time screen gets focus
  useFocusEffect(
    useCallback(() => {
      loadCart();
    }, [loadCart])
  );

  const saveCart = async (items: CartItem[]) => {
    await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    setCartItems(items);
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const updated = [...cartItems];
    updated[index].quantity = Math.max(1, updated[index].quantity + delta);
    saveCart(updated);
  };

  const handleRemoveItem = (index: number) => {
    const item = cartItems[index];
    const doRemove = () => {
      const updated = cartItems.filter((_, i) => i !== index);
      saveCart(updated);
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`¿Quitar "${item.name}" del pedido?`);
      if (confirmed) doRemove();
    } else {
      Alert.alert('Quitar del pedido', `¿Quitar "${item.name}" del pedido?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const handleClearCart = () => {
    const doClear = () => saveCart([]);

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Vaciar todo el pedido?');
      if (confirmed) doClear();
    } else {
      Alert.alert('Vaciar pedido', '¿Vaciar todo el pedido?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Vaciar', style: 'destructive', onPress: doClear },
      ]);
    }
  };

  const handleSubmitOrder = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Pedido vacío', 'Agregá ítems al pedido primero.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'orders'), {
        userId: userProfile?.uid || 'unknown',
        userName: userProfile?.displayName || 'Desconocido',
        items: cartItems.map((item) => ({
          path: item.path,
          name: item.name,
          quantity: item.quantity,
        })),
        notes: orderNotes.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Clear cart
      await saveCart([]);
      setOrderNotes('');

      const msg = '✅ Pedido enviado correctamente. Un administrador lo revisará pronto.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Pedido enviado', msg);

      router.push('/orders');
    } catch (error) {
      console.error('Error submitting order:', error);
      Alert.alert('Error', 'No se pudo enviar el pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const renderCartItem = ({ item, index }: { item: CartItem; index: number }) => {
    const category = item.path.slice(0, -1).join(' › ');

    return (
      <View style={styles.cartItemCard}>
        <View style={styles.cartItemContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cartItemName}>{item.name}</Text>
            <Text style={styles.cartItemPath}>{category}</Text>
          </View>
          <TouchableOpacity
            style={styles.removeItemBtn}
            onPress={() => handleRemoveItem(index)}
            activeOpacity={0.7}
          >
            <Text style={styles.removeItemText}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quantityControlRow}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleUpdateQuantity(index, -1)}
            activeOpacity={0.7}
          >
            <Text style={styles.qtyBtnText}>−</Text>
          </TouchableOpacity>
          <View style={styles.qtyDisplay}>
            <Text style={styles.qtyDisplayText}>{item.quantity}</Text>
          </View>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleUpdateQuantity(index, 1)}
            activeOpacity={0.7}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🛒 Mi Pedido</Text>
        {cartItems.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClearCart}
            activeOpacity={0.7}
          >
            <Text style={styles.clearBtnText}>Vaciar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1f6feb" />
        </View>
      ) : cartItems.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>Pedido vacío</Text>
          <Text style={styles.emptyText}>
            Navegá al catálogo y presioná &quot;Agregar al pedido&quot; en los ítems que necesitás.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={cartItems}
            keyExtractor={(_, idx) => String(idx)}
            renderItem={renderCartItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              <View>
                {/* Summary */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Ítems distintos</Text>
                    <Text style={styles.summaryValue}>{cartItems.length}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total unidades</Text>
                    <Text style={styles.summaryValue}>{totalItems}</Text>
                  </View>
                </View>

                {/* Notes */}
                <Text style={styles.label}>
                  Notas del pedido (opcional)
                </Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Ej: Para obra de calle 10, urgente..."
                  placeholderTextColor="#484f58"
                  value={orderNotes}
                  onChangeText={setOrderNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.btnDisabled]}
                  onPress={handleSubmitOrder}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.submitBtnIcon}>📩</Text>
                      <Text style={styles.submitBtnText}>Enviar Pedido</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            }
          />
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
  clearBtn: {
    paddingVertical: 6,
    paddingLeft: 12,
  },
  clearBtnText: {
    color: '#f85149',
    fontSize: 14,
    fontWeight: '600',
  },

  // Cart items
  cartItemCard: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cartItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  cartItemName: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: '600',
  },
  cartItemPath: {
    color: '#58a6ff',
    fontSize: 12,
    marginTop: 2,
  },
  removeItemBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2d1215',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeItemText: {
    color: '#f85149',
    fontSize: 14,
    fontWeight: 'bold',
  },
  quantityControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 12,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#21262d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  qtyDisplay: {
    backgroundColor: '#0d1117',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  qtyDisplayText: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Summary
  summaryCard: {
    backgroundColor: '#161b22',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#8b949e',
    fontSize: 14,
  },
  summaryValue: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Notes & Submit
  label: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: '#161b22',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    fontSize: 14,
    minHeight: 70,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#238636',
    borderRadius: 14,
    paddingVertical: 18,
    gap: 10,
    elevation: 3,
    shadowColor: '#3fb950',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  submitBtnIcon: {
    fontSize: 22,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // List
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Loading / Empty
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 8,
  },
  emptyText: {
    color: '#8b949e',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
