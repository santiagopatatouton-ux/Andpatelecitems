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
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDoc
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../utils/auth-context';

// Generate a Firestore-safe document ID from the item name (normalized)
function normalizeItemName(name: string): string {
  if (!name) return 'unknown_item';
  return name.trim().toLowerCase().replace(/[\/\.]/g, '_');
}

export default function ActionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path: string }>();
  const itemPath: string[] = params.path ? JSON.parse(params.path) : [];
  const { userProfile, user, isAdmin } = useAuth();

  const [stockData, setStockData] = useState<any>({ stock: 0, minStock: 5, unitCost: 0 });
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Settings state (Admin only)
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editMinStock, setEditMinStock] = useState('5');
  const [editUnitCost, setEditUnitCost] = useState('0');
  const [savingSettings, setSavingSettings] = useState(false);

  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  const itemName = itemPath[itemPath.length - 1] || 'Ítem';
  const docId = normalizeItemName(itemName);

  // Subscribe to real-time stock updates and recent movements
  useEffect(() => {
    if (!docId) return;

    // Stock subscription
    const stockRef = doc(db, 'stock', docId);
    const unsubStock = onSnapshot(
      stockRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setStockData({
            stock: data.stock || 0,
            minStock: data.minStock ?? 5,
            unitCost: data.unitCost || 0
          });
          setEditMinStock(String(data.minStock ?? 5));
          setEditUnitCost(String(data.unitCost || 0));
        } else {
          setStockData({ stock: 0, minStock: 5, unitCost: 0 });
          setEditMinStock('5');
          setEditUnitCost('0');
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error loading stock:', error);
        setStockData({ stock: 0, minStock: 5, unitCost: 0 });
        setLoading(false);
      }
    );

    // Recent movements subscription
    const movementsRef = collection(db, 'movements');
    const q = query(
      movementsRef,
      where('docId', '==', docId),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    const unsubMovements = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setRecentMovements(data);
    }, (error) => {
      console.error('Error loading movements:', error);
    });

    return () => {
      unsubStock();
      unsubMovements();
    };
  }, [docId]);

  const handleAction = async (action: 'retirar' | 'devolver') => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }

    if (action === 'retirar' && qty > stockData.stock) {
      Alert.alert(
        'Stock insuficiente',
        `Solo hay ${stockData.stock} unidades disponibles. No podés retirar ${qty}.`
      );
      return;
    }

    try {
      setSubmitting(true);

      const newStock = action === 'retirar' ? stockData.stock - qty : stockData.stock + qty;

      // Update stock document
      const stockRef = doc(db, 'stock', docId);
      await setDoc(
        stockRef,
        {
          name: itemName,
          stock: newStock,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      // Log the movement
      await addDoc(collection(db, 'movements'), {
        docId, // normalized name
        path: itemPath, // store where they accessed it from
        action,
        quantity: qty,
        stockBefore: stockData.stock,
        stockAfter: newStock,
        notes: notes.trim(),
        userId: user?.uid || 'unknown',
        userName: userProfile?.displayName || user?.email || 'Desconocido',
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

  const saveSettings = async () => {
    const newMin = parseInt(editMinStock, 10) || 5;
    const newCost = parseFloat(editUnitCost) || 0;

    try {
      setSavingSettings(true);
      const stockRef = doc(db, 'stock', docId);
      await setDoc(
        stockRef,
        {
          name: itemName,
          minStock: newMin,
          unitCost: newCost,
        },
        { merge: true }
      );
      setIsEditingSettings(false);
      Alert.alert('Éxito', 'Configuración actualizada.');
    } catch (error) {
      console.error('Error guardando config:', error);
      Alert.alert('Error', 'No se pudo guardar la configuración.');
    } finally {
      setSavingSettings(false);
    }
  };

  const requestRestock = async () => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Cantidad inválida', 'Ingresá la cantidad que necesitás solicitar en el campo "Cantidad a operar".');
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`¿Deseas enviar una solicitud de compra por ${qty} unidades de ${itemName}?`);
      if (confirmed) {
        executeRequestRestock(qty);
      }
    } else {
      Alert.alert(
        'Solicitar Reposición',
        `¿Deseas enviar una solicitud de compra por ${qty} unidades de ${itemName}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Solicitar', onPress: () => executeRequestRestock(qty) }
        ]
      );
    }
  };

  const executeRequestRestock = async (qty: number) => {
    try {
      setSubmitting(true);
      await addDoc(collection(db, 'requisitions'), {
        docId,
        itemName,
        path: itemPath,
        requestedQuantity: qty,
        notes: notes.trim(),
        status: 'pending',
        requestedBy: userProfile?.displayName || user?.email || 'Desconocido',
        userId: user?.uid || 'unknown',
        timestamp: serverTimestamp()
      });
      if (Platform.OS === 'web') {
        window.alert('✅ Solicitud Enviada. El administrador fue notificado.');
      } else {
        Alert.alert('✅ Solicitud Enviada', 'El administrador fue notificado.');
      }
      setQuantity('1');
      setNotes('');
    } catch (error) {
      console.error('Error request:', error);
      Alert.alert('Error', 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStockColor = (s: number, min: number) => {
    if (s <= 0) return '#f85149';
    if (s <= min) return '#d29922';
    return '#3fb950';
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '...';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', 
      hour: '2-digit', minute: '2-digit'
    });
  };

  const totalValue = (stockData.stock * stockData.unitCost).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Atrás</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{itemName}</Text>
        <View style={{ width: 70 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Path breadcrumb */}
          <View style={styles.pathContainer}>
            <Text style={styles.pathLabel}>📍 Ubicación de acceso</Text>
            <Text style={styles.pathText}>{itemPath.join(' › ')}</Text>
          </View>

          {/* Stock display */}
          <View style={styles.stockCard}>
            <Text style={styles.stockLabel}>Stock actual</Text>
            <Text style={[styles.stockNumber, { color: getStockColor(stockData.stock, stockData.minStock) }]}>
              {stockData.stock}
            </Text>
            
            <View style={styles.metricsRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Mínimo</Text>
                <Text style={styles.metricValue}>{stockData.minStock}</Text>
              </View>
              {isAdmin && (
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Valor Total</Text>
                  <Text style={styles.metricValue}>{totalValue}</Text>
                </View>
              )}
            </View>

            {isAdmin && (
              <TouchableOpacity style={styles.settingsToggle} onPress={() => setIsEditingSettings(!isEditingSettings)}>
                <Text style={styles.settingsToggleText}>⚙️ Configurar</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Admin Settings Panel */}
          {isAdmin && isEditingSettings && (
            <View style={styles.settingsPanel}>
              <Text style={styles.panelTitle}>Configuración del Ítem</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Stock Mínimo (Alerta)</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={editMinStock}
                  onChangeText={setEditMinStock}
                  keyboardType="numeric"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Costo Unitario ($)</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={editUnitCost}
                  onChangeText={setEditUnitCost}
                  keyboardType="decimal-pad"
                />
              </View>
              
              <TouchableOpacity style={styles.saveSettingsBtn} onPress={saveSettings} disabled={savingSettings}>
                {savingSettings ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveSettingsText}>Guardar Configuración</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Quantity input */}
          <View style={styles.quantitySection}>
            <Text style={styles.label}>Cantidad a operar</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setQuantity(String(Math.max(1, parseInt(quantity, 10) - 1 || 1)))}
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
                onPress={() => setQuantity(String((parseInt(quantity, 10) || 0) + 1))}
                activeOpacity={0.7}
              >
                <Text style={styles.quantityBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notes */}
          <Text style={styles.label}>Notas / Detalles (opcional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Ej: Para obra calle 10..."
            placeholderTextColor="#484f58"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.btnRetirar, submitting && styles.btnDisabled]}
              onPress={() => handleAction('retirar')}
              disabled={submitting || stockData.stock <= 0}
              activeOpacity={0.7}
            >
              <Text style={styles.btnActionIcon}>📤</Text>
              <Text style={styles.btnActionText}>Retirar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnDevolver, submitting && styles.btnDisabled]}
              onPress={() => handleAction('devolver')}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Text style={styles.btnActionIcon}>📥</Text>
              <Text style={styles.btnActionText}>Devolver</Text>
            </TouchableOpacity>
          </View>

          {/* Request button */}
          <TouchableOpacity 
            style={[styles.btnRequest, submitting && styles.btnDisabled]}
            onPress={requestRestock}
            disabled={submitting}
          >
            <Text style={styles.btnRequestIcon}>🛒</Text>
            <Text style={styles.btnRequestText}>Solicitar Compra / Reposición</Text>
          </TouchableOpacity>
          
          {/* Recent movements */}
          {recentMovements.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>Últimos movimientos globales</Text>
              {recentMovements.map((mov) => {
                const isRetiro = mov.action === 'retirar';
                return (
                  <View key={mov.id} style={styles.recentItem}>
                    <Text style={styles.recentIcon}>{isRetiro ? '📤' : '📥'}</Text>
                    <View style={styles.recentInfo}>
                      <Text style={styles.recentUser}>{mov.userName?.split('@')[0] || 'Alguien'}</Text>
                      <Text style={styles.recentDate}>{formatDate(mov.timestamp)}</Text>
                    </View>
                    <Text style={[styles.recentQty, isRetiro ? styles.textRed : styles.textGreen]}>
                      {isRetiro ? '-' : '+'}{mov.quantity}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { color: '#58a6ff', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#f0f6fc', fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  pathContainer: { backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  pathLabel: { color: '#8b949e', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  pathText: { color: '#58a6ff', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  
  stockCard: { backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  stockLabel: { color: '#8b949e', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  stockNumber: { fontSize: 56, fontWeight: 'bold' },
  metricsRow: { flexDirection: 'row', gap: 24, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#21262d', width: '100%', justifyContent: 'space-around' },
  metricBox: { alignItems: 'center' },
  metricLabel: { color: '#8b949e', fontSize: 12, textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { color: '#c9d1d9', fontSize: 16, fontWeight: 'bold' },
  settingsToggle: { marginTop: 16, padding: 8, backgroundColor: '#21262d', borderRadius: 8 },
  settingsToggleText: { color: '#58a6ff', fontSize: 12, fontWeight: 'bold' },
  
  settingsPanel: { backgroundColor: '#1f3a5f', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1f6feb' },
  panelTitle: { color: '#f0f6fc', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  inputGroup: { marginBottom: 12 },
  settingsInput: { backgroundColor: '#0d1117', color: '#f0f6fc', borderColor: '#30363d', borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15 },
  saveSettingsBtn: { backgroundColor: '#238636', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  saveSettingsText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  
  quantitySection: { marginBottom: 16 },
  label: { color: '#c9d1d9', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantityBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d', justifyContent: 'center', alignItems: 'center' },
  quantityBtnText: { color: '#f0f6fc', fontSize: 24, fontWeight: 'bold' },
  quantityInput: { flex: 1, backgroundColor: '#161b22', color: '#f0f6fc', borderColor: '#30363d', borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 24, fontWeight: 'bold' },
  notesInput: { backgroundColor: '#161b22', color: '#f0f6fc', borderColor: '#30363d', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  
  actionButtons: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  btnRetirar: { flex: 1, backgroundColor: '#b33a2a', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnDevolver: { flex: 1, backgroundColor: '#1a7f37', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnActionIcon: { fontSize: 24, marginBottom: 4 },
  btnActionText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.5 },
  
  btnRequest: { backgroundColor: '#d29922', borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 10 },
  btnRequestIcon: { fontSize: 20 },
  btnRequestText: { color: '#000', fontSize: 15, fontWeight: 'bold' },

  recentSection: { marginTop: 8, padding: 16, backgroundColor: '#161b22', borderRadius: 12, borderWidth: 1, borderColor: '#30363d' },
  recentTitle: { color: '#c9d1d9', fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  recentItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  recentIcon: { fontSize: 16, marginRight: 12 },
  recentInfo: { flex: 1 },
  recentUser: { color: '#f0f6fc', fontSize: 14, fontWeight: '500' },
  recentDate: { color: '#8b949e', fontSize: 12 },
  recentQty: { fontSize: 16, fontWeight: 'bold' },
  textRed: { color: '#f85149' },
  textGreen: { color: '#3fb950' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#8b949e', marginTop: 12, fontSize: 14 },
});
