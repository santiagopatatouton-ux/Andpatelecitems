import React, { useState, useEffect, useMemo } from 'react';
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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebaseConfig';
import { useAuth } from '../context/auth-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { pathToDocId } from '../utils/paths';

const CART_STORAGE_KEY = 'andpatelec_cart';

// Default units of measurement
const UNIT_OPTIONS = [
  { value: 'unidad', label: 'Unidad', shortLabel: 'u' },
  { value: 'metro', label: 'Metro', shortLabel: 'm' },
  { value: 'rollo', label: 'Rollo', shortLabel: 'rollo' },
  { value: 'caja', label: 'Caja', shortLabel: 'caja' },
  { value: 'pack', label: 'Pack', shortLabel: 'pack' },
  { value: 'kg', label: 'Kilogramo', shortLabel: 'kg' },
  { value: 'litro', label: 'Litro', shortLabel: 'lt' },
  { value: 'tramo', label: 'Tramo', shortLabel: 'tramo' },
];

interface CartItem {
  path: string[];
  name: string;
  quantity: number;
}

export default function ActionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path: string }>();
  const itemPath: string[] = useMemo(() => {
    try {
      return params.path ? JSON.parse(params.path) : [];
    } catch {
      return [];
    }
  }, [params.path]);
  const { userProfile } = useAuth();

  const [stock, setStock] = useState<number>(0);
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [unitOfMeasure, setUnitOfMeasure] = useState<string>('unidad');
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Purchase form state (for "Agregar Stock")
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');

  // Favorites state
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteDocId, setFavoriteDocId] = useState<string | null>(null);
  const [togglingFav, setTogglingFav] = useState(false);

  // Cart state
  const [addingToCart, setAddingToCart] = useState(false);

  // Image state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Unit picker state
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  const docId = pathToDocId(itemPath);
  const itemName = itemPath[itemPath.length - 1] || 'Ítem';

  const currentUnit = UNIT_OPTIONS.find((u) => u.value === unitOfMeasure) || UNIT_OPTIONS[0];

  // Subscribe to real-time stock updates
  useEffect(() => {
    if (!docId) return;

    const stockRef = doc(db, 'stock', docId);
    const unsubscribe = onSnapshot(
      stockRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setStock(data.stock || 0);
          setUnitCost(data.unitCost ?? null);
          setUnitOfMeasure(data.unitOfMeasure || 'unidad');
          setImageUrl(data.imageUrl || null);
        } else {
          setStock(0);
          setUnitCost(null);
          setUnitOfMeasure('unidad');
          setImageUrl(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error loading stock:', error);
        setStock(0);
        setUnitCost(null);
        setUnitOfMeasure('unidad');
        setImageUrl(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [docId]);

  // Check if item is a favorite
  useEffect(() => {
    if (!userProfile?.uid || !itemPath.length) return;

    const favsRef = collection(db, 'users', userProfile.uid, 'favorites');
    const unsubscribe = onSnapshot(favsRef, (snapshot) => {
      const match = snapshot.docs.find((d) => {
        const data = d.data();
        return JSON.stringify(data.path) === JSON.stringify(itemPath);
      });
      if (match) {
        setIsFavorite(true);
        setFavoriteDocId(match.id);
      } else {
        setIsFavorite(false);
        setFavoriteDocId(null);
      }
    });

    return () => unsubscribe();
  }, [userProfile?.uid, itemPath]);

  const handleToggleFavorite = async () => {
    if (!userProfile?.uid) return;
    setTogglingFav(true);

    try {
      if (isFavorite && favoriteDocId) {
        // Remove from favorites
        await deleteDoc(doc(db, 'users', userProfile.uid, 'favorites', favoriteDocId));
      } else {
        // Add to favorites
        await addDoc(collection(db, 'users', userProfile.uid, 'favorites'), {
          path: itemPath,
          name: itemName,
          addedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'No se pudo actualizar favoritos.');
    } finally {
      setTogglingFav(false);
    }
  };

  // ======== IMAGE UPLOAD ========
  const handlePickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos requeridos',
          'Necesitamos acceso a tu galería para subir imágenes.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos requeridos',
          'Necesitamos acceso a la cámara para tomar fotos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'No se pudo tomar la foto.');
    }
  };

  const uploadImage = async (uri: string) => {
    setUploadingImage(true);
    try {
      // Convert URI to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Create storage reference
      const fileName = `items/${docId}_${Date.now()}.jpg`;
      const storageRef = ref(storage, fileName);

      // Upload
      await uploadBytes(storageRef, blob);

      // Get download URL
      const downloadUrl = await getDownloadURL(storageRef);

      // Save URL to the stock document
      const stockRef = doc(db, 'stock', docId);
      await setDoc(
        stockRef,
        {
          path: itemPath,
          imageUrl: downloadUrl,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      setImageUrl(downloadUrl);

      const msg = '📸 Imagen subida correctamente.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Imagen subida', msg);
    } catch (error: any) {
      console.error('Error uploading image:', error);
      const errMsg = error?.message?.includes('unauthorized') || error?.code === 'storage/unauthorized'
        ? 'No tenés permisos para subir imágenes. Verificá las reglas de Firebase Storage.'
        : 'No se pudo subir la imagen. Intentá de nuevo.';
      Alert.alert('Error', errMsg);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    const doRemove = async () => {
      try {
        const stockRef = doc(db, 'stock', docId);
        await setDoc(
          stockRef,
          {
            imageUrl: null,
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
        setImageUrl(null);
      } catch (error) {
        console.error('Error removing image:', error);
        Alert.alert('Error', 'No se pudo quitar la imagen.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Quitar la imagen de este ítem?');
      if (confirmed) doRemove();
    } else {
      Alert.alert('Quitar imagen', '¿Quitar la imagen de este ítem?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  // ======== UNIT OF MEASURE ========
  const handleChangeUnit = async (newUnit: string) => {
    try {
      const stockRef = doc(db, 'stock', docId);
      await setDoc(
        stockRef,
        {
          path: itemPath,
          unitOfMeasure: newUnit,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setUnitOfMeasure(newUnit);
      setShowUnitPicker(false);
    } catch (error) {
      console.error('Error changing unit:', error);
      Alert.alert('Error', 'No se pudo cambiar la unidad de medida.');
    }
  };

  const handleAddToCart = async () => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }

    setAddingToCart(true);
    try {
      // Load existing cart from AsyncStorage
      const cartJson = await AsyncStorage.getItem(CART_STORAGE_KEY);
      const cart: CartItem[] = cartJson ? JSON.parse(cartJson) : [];

      // Check if item already in cart
      const existingIdx = cart.findIndex(
        (c) => JSON.stringify(c.path) === JSON.stringify(itemPath)
      );

      if (existingIdx >= 0) {
        cart[existingIdx].quantity += qty;
      } else {
        cart.push({ path: itemPath, name: itemName, quantity: qty });
      }

      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));

      const msg = `🛒 ${qty}x "${itemName}" agregado al pedido.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Agregado', msg);
    } catch (error) {
      console.error('Error adding to cart:', error);
      Alert.alert('Error', 'No se pudo agregar al carrito.');
    } finally {
      setAddingToCart(false);
    }
  };

  // ======== PURCHASE (Add Stock) ========
  const handleAddStock = async () => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }

    const price = purchasePrice.trim()
      ? parseFloat(purchasePrice.replace(',', '.'))
      : null;

    if (purchasePrice.trim() && (isNaN(price!) || price! < 0)) {
      Alert.alert('Precio inválido', 'Ingresá un precio válido o dejalo vacío.');
      return;
    }

    try {
      setSubmitting(true);
      const newStock = stock + qty;
      const totalCost = price != null ? price * qty : null;

      // Update stock document
      const stockRef = doc(db, 'stock', docId);
      const stockUpdate: any = {
        path: itemPath,
        stock: newStock,
        lastUpdated: serverTimestamp(),
      };
      if (price != null) {
        stockUpdate.unitCost = price;
        stockUpdate.lastPurchaseDate = serverTimestamp();
      }
      await setDoc(stockRef, stockUpdate, { merge: true });

      // Log the purchase movement
      await addDoc(collection(db, 'movements'), {
        path: itemPath,
        action: 'compra',
        quantity: qty,
        stockBefore: stock,
        stockAfter: newStock,
        unitCost: price,
        totalCost: totalCost,
        supplier: purchaseSupplier.trim() || null,
        notes: notes.trim(),
        timestamp: serverTimestamp(),
        userId: userProfile?.uid || 'unknown',
        userName: userProfile?.displayName || 'Desconocido',
      });

      const unitLabel = currentUnit.label.toLowerCase() + (qty > 1 ? 's' : '');
      const priceStr = price != null ? ` a $${price} c/u (Total: $${totalCost?.toLocaleString('es-AR')})` : '';
      const supplierStr = purchaseSupplier.trim() ? `\nProveedor: ${purchaseSupplier.trim()}` : '';
      Alert.alert(
        '📦 Stock agregado',
        `${qty} ${unitLabel} de ${itemName}${priceStr}.${supplierStr}\nStock actual: ${newStock}`,
        [{ text: 'OK' }]
      );

      setQuantity('1');
      setNotes('');
      setPurchasePrice('');
      setPurchaseSupplier('');
      setShowPurchaseForm(false);
    } catch (error) {
      console.error('Error registrando compra:', error);
      Alert.alert('Error', 'No se pudo registrar la compra.');
    } finally {
      setSubmitting(false);
    }
  };

  // ======== WITHDRAW / RETURN ========
  const handleAction = async (action: 'retirar' | 'devolver') => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }

    if (action === 'retirar' && qty > stock) {
      Alert.alert(
        'Stock insuficiente',
        `Solo hay ${stock} ${currentUnit.label.toLowerCase()}${stock !== 1 ? 's' : ''} disponibles. No podés retirar ${qty}.`
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
        unitCost: null,
        totalCost: null,
        supplier: null,
        notes: notes.trim(),
        timestamp: serverTimestamp(),
        userId: userProfile?.uid || 'unknown',
        userName: userProfile?.displayName || 'Desconocido',
      });

      const unitLabel = currentUnit.label.toLowerCase() + (qty > 1 ? 's' : '');
      const emoji = action === 'retirar' ? '📤' : '📥';
      const verb = action === 'retirar' ? 'Retirado' : 'Devuelto';
      Alert.alert(
        `${emoji} ${verb}`,
        `${qty} ${unitLabel} de ${itemName}.\nStock actual: ${newStock}`,
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
        <TouchableOpacity
          style={styles.favBtn}
          onPress={handleToggleFavorite}
          disabled={togglingFav}
          activeOpacity={0.7}
        >
          {togglingFav ? (
            <ActivityIndicator size="small" color="#d29922" />
          ) : (
            <Text style={styles.favBtnText}>
              {isFavorite ? '⭐' : '☆'}
            </Text>
          )}
        </TouchableOpacity>
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

          {/* Item Image */}
          <View style={styles.imageSection}>
            {imageUrl ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.itemImage}
                  resizeMode="cover"
                />
                <View style={styles.imageOverlay}>
                  <TouchableOpacity
                    style={styles.imageChangeBtn}
                    onPress={handlePickImage}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.imageChangeBtnText}>📷 Cambiar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.imageRemoveBtn}
                    onPress={handleRemoveImage}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.imageRemoveBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.noImageContainer}>
                {uploadingImage ? (
                  <View style={styles.uploadingContainer}>
                    <ActivityIndicator size="large" color="#1f6feb" />
                    <Text style={styles.uploadingText}>Subiendo imagen...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.noImageIcon}>📷</Text>
                    <Text style={styles.noImageText}>Sin imagen</Text>
                    <View style={styles.imageButtonsRow}>
                      <TouchableOpacity
                        style={styles.addImageBtn}
                        onPress={handlePickImage}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addImageBtnText}>🖼️ Galería</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.addImageBtn}
                        onPress={handleTakePhoto}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.addImageBtnText}>📸 Cámara</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
            {uploadingImage && imageUrl && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.uploadingOverlayText}>Subiendo...</Text>
              </View>
            )}
          </View>

          {/* Stock display */}
          <View style={styles.stockCard}>
            <Text style={styles.stockLabel}>Stock actual</Text>
            <Text style={[styles.stockNumber, { color: getStockColor(stock) }]}>
              {stock}
            </Text>
            {/* Unit of Measure Badge */}
            <TouchableOpacity
              style={styles.unitBadge}
              onPress={() => setShowUnitPicker(!showUnitPicker)}
              activeOpacity={0.7}
            >
              <Text style={styles.unitBadgeText}>
                {currentUnit.label}{stock !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.unitBadgeArrow}>{showUnitPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {/* Unit Picker */}
            {showUnitPicker && (
              <View style={styles.unitPickerContainer}>
                <Text style={styles.unitPickerTitle}>📏 Unidad de medida</Text>
                <View style={styles.unitPickerGrid}>
                  {UNIT_OPTIONS.map((unit) => (
                    <TouchableOpacity
                      key={unit.value}
                      style={[
                        styles.unitPickerOption,
                        unitOfMeasure === unit.value && styles.unitPickerOptionActive,
                      ]}
                      onPress={() => handleChangeUnit(unit.value)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.unitPickerOptionText,
                          unitOfMeasure === unit.value && styles.unitPickerOptionTextActive,
                        ]}
                      >
                        {unit.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {unitCost != null && (
              <View style={styles.unitCostBadge}>
                <Text style={styles.unitCostLabel}>💰 Último precio de compra</Text>
                <Text style={styles.unitCostValue}>
                  ${unitCost.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /{currentUnit.shortLabel}
                </Text>
              </View>
            )}
          </View>

          {/* Quantity input */}
          <View style={styles.quantitySection}>
            <Text style={styles.label}>Cantidad ({currentUnit.label.toLowerCase()}s)</Text>
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

          {/* ========== 3 ACTION BUTTONS ========== */}

          {/* Add Stock button (purchase) */}
          <TouchableOpacity
            style={[styles.btnAddStock, submitting && styles.btnDisabled]}
            onPress={() => {
              if (showPurchaseForm) {
                handleAddStock();
              } else {
                setShowPurchaseForm(true);
              }
            }}
            disabled={submitting}
            activeOpacity={0.7}
          >
            {submitting && showPurchaseForm ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.btnActionIcon}>📦</Text>
                <Text style={styles.btnActionText}>Agregar Stock</Text>
                <Text style={styles.btnActionSub}>
                  +{parseInt(quantity, 10) || 0} {currentUnit.shortLabel} (compra)
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Purchase form (shown when "Agregar Stock" is tapped) */}
          {showPurchaseForm && (
            <View style={styles.purchaseForm}>
              <Text style={styles.purchaseFormTitle}>💰 Datos de la compra</Text>

              <Text style={styles.purchaseFormLabel}>Precio por {currentUnit.label.toLowerCase()} ($)</Text>
              <TextInput
                style={styles.purchaseFormInput}
                placeholder="Ej: 1500.50 (opcional)"
                placeholderTextColor="#484f58"
                value={purchasePrice}
                onChangeText={setPurchasePrice}
                keyboardType="decimal-pad"
              />
              {purchasePrice.trim() !== '' && !isNaN(parseFloat(purchasePrice.replace(',', '.'))) && (
                <Text style={styles.purchaseFormTotal}>
                  Total: ${(parseFloat(purchasePrice.replace(',', '.')) * (parseInt(quantity, 10) || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              )}

              <Text style={styles.purchaseFormLabel}>Proveedor (opcional)</Text>
              <TextInput
                style={styles.purchaseFormInput}
                placeholder="Ej: Electro Sur SRL"
                placeholderTextColor="#484f58"
                value={purchaseSupplier}
                onChangeText={setPurchaseSupplier}
              />

              <View style={styles.purchaseFormBtnRow}>
                <TouchableOpacity
                  style={styles.purchaseFormCancelBtn}
                  onPress={() => {
                    setShowPurchaseForm(false);
                    setPurchasePrice('');
                    setPurchaseSupplier('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.purchaseFormCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.purchaseFormConfirmBtn, submitting && styles.btnDisabled]}
                  onPress={handleAddStock}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.purchaseFormConfirmText}>
                      ✅ Confirmar compra
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Withdraw / Return buttons */}
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
                    −{parseInt(quantity, 10) || 0} {currentUnit.shortLabel}
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
                    +{parseInt(quantity, 10) || 0} {currentUnit.shortLabel}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Add to cart button */}
          <TouchableOpacity
            style={[styles.cartBtn, addingToCart && styles.btnDisabled]}
            onPress={handleAddToCart}
            disabled={addingToCart}
            activeOpacity={0.7}
          >
            {addingToCart ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.cartBtnIcon}>🛒</Text>
                <Text style={styles.cartBtnText}>Agregar al pedido</Text>
              </>
            )}
          </TouchableOpacity>
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
  favBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favBtnText: {
    fontSize: 22,
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

  // Image section
  imageSection: {
    marginBottom: 16,
    position: 'relative',
  },
  imageContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#30363d',
    position: 'relative',
  },
  itemImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#161b22',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(13, 17, 23, 0.8)',
  },
  imageChangeBtn: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  imageChangeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  imageRemoveBtn: {
    backgroundColor: '#b33a2a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  imageRemoveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  noImageContainer: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  noImageIcon: {
    fontSize: 40,
    marginBottom: 8,
    opacity: 0.5,
  },
  noImageText: {
    color: '#484f58',
    fontSize: 14,
    marginBottom: 14,
  },
  imageButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addImageBtn: {
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addImageBtnText: {
    color: '#58a6ff',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadingContainer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  uploadingText: {
    color: '#58a6ff',
    fontSize: 14,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 17, 23, 0.7)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  uploadingOverlayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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

  // Unit badge
  unitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f3a5f33',
    borderColor: '#1f6feb66',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
    gap: 6,
  },
  unitBadgeText: {
    color: '#58a6ff',
    fontSize: 14,
    fontWeight: '600',
  },
  unitBadgeArrow: {
    color: '#58a6ff',
    fontSize: 10,
  },

  // Unit picker
  unitPickerContainer: {
    marginTop: 14,
    width: '100%',
    backgroundColor: '#0d1117',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  unitPickerTitle: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  unitPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  unitPickerOption: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unitPickerOptionActive: {
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
  },
  unitPickerOptionText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  unitPickerOptionTextActive: {
    color: '#f0f6fc',
  },

  unitCostBadge: {
    marginTop: 14,
    backgroundColor: '#1f3a5f33',
    borderColor: '#1f6feb66',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  unitCostLabel: {
    color: '#8b949e',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  unitCostValue: {
    color: '#58a6ff',
    fontSize: 16,
    fontWeight: 'bold',
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

  // ======== ADD STOCK (purchase) button ========
  btnAddStock: {
    backgroundColor: '#1f6feb',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#1f6feb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  // ======== PURCHASE FORM ========
  purchaseForm: {
    backgroundColor: '#161b22',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  purchaseFormTitle: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  purchaseFormLabel: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  purchaseFormInput: {
    backgroundColor: '#0d1117',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 8,
  },
  purchaseFormTotal: {
    color: '#3fb950',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    paddingLeft: 4,
  },
  purchaseFormBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  purchaseFormCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#21262d',
    borderRadius: 8,
  },
  purchaseFormCancelText: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: '600',
  },
  purchaseFormConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#238636',
    borderRadius: 8,
  },
  purchaseFormConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Action buttons (Retirar / Devolver)
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

  // Cart button
  cartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    gap: 8,
  },
  cartBtnIcon: {
    fontSize: 20,
  },
  cartBtnText: {
    color: '#58a6ff',
    fontSize: 16,
    fontWeight: '600',
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
