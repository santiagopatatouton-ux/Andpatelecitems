import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../context/auth-context';
import { exportMovementsToExcel, MovementRow } from '../utils/export-excel';
import { exportAccountingExcel } from '../utils/export-accounting';

interface Movement {
  id: string;
  path: string[];
  action: 'retirar' | 'devolver' | 'compra';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  notes: string;
  timestamp: any;
  userId?: string;
  userName?: string;
  unitCost?: number | null;
  totalCost?: number | null;
  supplier?: string | null;
}

interface UserOption {
  uid: string;
  displayName: string;
}

export default function HistoryScreen() {
  const router = useRouter();
  const { isAdmin, userProfile } = useAuth();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingAccounting, setExportingAccounting] = useState(false);

  // Filters
  const [filterAction, setFilterAction] = useState<'all' | 'retirar' | 'devolver' | 'compra'>('all');
  const [filterItem, setFilterItem] = useState('');
  const [filterUserId, setFilterUserId] = useState<string>('all'); // 'all' or a specific userId
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);

  // Load user list for admin filter
  useEffect(() => {
    if (!isAdmin) return;
    const loadUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersList: UserOption[] = usersSnapshot.docs.map((doc) => ({
          uid: doc.id,
          displayName: doc.data().displayName || 'Sin nombre',
        }));
        setAllUsers(usersList);
      } catch (error) {
        console.error('Error loading users for filter:', error);
      }
    };
    loadUsers();
  }, [isAdmin]);

  // Load movements
  useEffect(() => {
    const movementsRef = collection(db, 'movements');
    let q;

    if (!isAdmin && userProfile?.uid) {
      // Employees only see their own movements
      q = query(
        movementsRef,
        where('userId', '==', userProfile.uid),
        orderBy('timestamp', 'desc')
      );
    } else {
      // Admins see all
      q = query(movementsRef, orderBy('timestamp', 'desc'));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Movement[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Movement[];
        setMovements(items);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading movements:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, userProfile?.uid]);

  // Apply filters
  const filteredMovements = movements.filter((mov) => {
    if (filterAction !== 'all' && mov.action !== filterAction) return false;
    if (isAdmin && filterUserId !== 'all' && mov.userId !== filterUserId) return false;
    if (filterItem) {
      const itemStr = mov.path.join(' ').toLowerCase();
      if (!itemStr.includes(filterItem.toLowerCase())) return false;
    }
    return true;
  });

  // Helper to convert movements to MovementRow
  const toMovementRows = (movs: Movement[]): MovementRow[] =>
    movs.map((mov) => ({
      timestamp: mov.timestamp,
      userName: mov.userName || 'Desconocido',
      path: mov.path,
      action: mov.action,
      quantity: mov.quantity,
      stockBefore: mov.stockBefore,
      stockAfter: mov.stockAfter,
      notes: mov.notes || '',
      unitCost: mov.unitCost ?? null,
      totalCost: mov.totalCost ?? null,
      supplier: mov.supplier ?? null,
    }));

  // Export handler (historial general)
  const handleExport = async () => {
    if (filteredMovements.length === 0) {
      if (Platform.OS === 'web') {
        window.alert('No hay movimientos para exportar.');
      } else {
        Alert.alert('Sin datos', 'No hay movimientos para exportar.');
      }
      return;
    }

    setExporting(true);
    try {
      const rows = toMovementRows(filteredMovements);
      const result = exportMovementsToExcel(rows);

      if (Platform.OS !== 'web' && result) {
        try {
          const FileSystem = require('expo-file-system');
          const Sharing = require('expo-sharing');
          const filename = `historial_andpatelec_${new Date().toISOString().split('T')[0]}.xlsx`;
          const fileUri = FileSystem.documentDirectory + filename;
          await FileSystem.writeAsStringAsync(fileUri, result, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Exportar historial',
          });
        } catch (shareError) {
          console.error('Error sharing file:', shareError);
          Alert.alert('Error', 'No se pudo compartir el archivo.');
        }
      } else if (Platform.OS === 'web') {
        window.alert('✅ Archivo Excel descargado correctamente.');
      }
    } catch (error) {
      console.error('Export error:', error);
      if (Platform.OS === 'web') {
        window.alert('Error al exportar. Intentá de nuevo.');
      } else {
        Alert.alert('Error', 'No se pudo exportar el historial.');
      }
    } finally {
      setExporting(false);
    }
  };

  // Export handler (contable - 2 hojas: Compras + Movimientos)
  const handleExportAccounting = async () => {
    if (movements.length === 0) {
      if (Platform.OS === 'web') {
        window.alert('No hay datos para exportar.');
      } else {
        Alert.alert('Sin datos', 'No hay datos para exportar.');
      }
      return;
    }

    setExportingAccounting(true);
    try {
      const rows = toMovementRows(movements);
      const result = exportAccountingExcel(rows);

      if (Platform.OS !== 'web' && result) {
        try {
          const FileSystem = require('expo-file-system');
          const Sharing = require('expo-sharing');
          const filename = `contable_andpatelec_${new Date().toISOString().split('T')[0]}.xlsx`;
          const fileUri = FileSystem.documentDirectory + filename;
          await FileSystem.writeAsStringAsync(fileUri, result, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Exportar Excel contable',
          });
        } catch (shareError) {
          console.error('Error sharing accounting file:', shareError);
          Alert.alert('Error', 'No se pudo compartir el archivo.');
        }
      } else if (Platform.OS === 'web') {
        window.alert('✅ Excel contable descargado correctamente (2 hojas: Compras + Movimientos).');
      }
    } catch (error) {
      console.error('Accounting export error:', error);
      if (Platform.OS === 'web') {
        window.alert('Error al exportar. Intentá de nuevo.');
      } else {
        Alert.alert('Error', 'No se pudo exportar el archivo contable.');
      }
    } finally {
      setExportingAccounting(false);
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'Sin fecha';
    let date: Date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      return 'Sin fecha';
    }
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMovement = ({ item }: { item: Movement }) => {
    const isEgreso = item.action === 'retirar';
    const isCompra = item.action === 'compra';
    const isDevolucion = item.action === 'devolver';
    const itemName = item.path[item.path.length - 1] || 'Ítem';
    const category = item.path.slice(0, -1).join(' › ');

    const getCardStyle = () => {
      if (isCompra) return styles.compraCard;
      if (isEgreso) return styles.egresoCard;
      return styles.ingresoCard;
    };

    const getBadgeStyle = () => {
      if (isCompra) return styles.compraBadge;
      if (isEgreso) return styles.egresoBadge;
      return styles.ingresoBadge;
    };

    const getBadgeLabel = () => {
      if (isCompra) return '📦 Compra';
      if (isEgreso) return '📤 Egreso';
      return '📥 Devolución';
    };

    const getQuantityColor = () => {
      if (isCompra) return styles.compraText;
      if (isEgreso) return styles.egresoText;
      return styles.ingresoText;
    };

    return (
      <View style={[styles.movementCard, getCardStyle()]}>
        <View style={styles.movementHeader}>
          <View style={[styles.actionBadge, getBadgeStyle()]}>
            <Text style={styles.actionBadgeText}>
              {getBadgeLabel()}
            </Text>
          </View>
          <Text style={styles.movementDate}>{formatDate(item.timestamp)}</Text>
        </View>

        <Text style={styles.movementItem}>{itemName}</Text>
        <Text style={styles.movementCategory}>{category}</Text>

        <View style={styles.movementDetails}>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Cantidad</Text>
            <Text style={[styles.detailValue, getQuantityColor()]}>
              {isEgreso ? '-' : '+'}{item.quantity}
            </Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Antes</Text>
            <Text style={styles.detailValue}>{item.stockBefore}</Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Después</Text>
            <Text style={styles.detailValue}>{item.stockAfter}</Text>
          </View>
          {isCompra && item.unitCost != null && (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>$/unid.</Text>
              <Text style={[styles.detailValue, styles.compraText]}>
                ${item.unitCost}
              </Text>
            </View>
          )}
          {isCompra && item.totalCost != null && (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Total</Text>
              <Text style={[styles.detailValue, styles.compraText]}>
                ${item.totalCost}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.movementFooter}>
          <Text style={styles.userName}>👤 {item.userName || 'Desconocido'}</Text>
          {isCompra && item.supplier ? (
            <Text style={styles.supplierText}>🏪 {item.supplier}</Text>
          ) : null}
          {item.notes ? (
            <Text style={styles.movementNotes} numberOfLines={2}>
              📝 {item.notes}
            </Text>
          ) : null}
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
        <Text style={styles.headerTitle}>
          {isAdmin ? '📋 Historial General' : '📋 Mi Historial'}
        </Text>
        <View style={styles.exportBtnGroup}>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && styles.btnDisabled]}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.7}
          >
            {exporting ? (
              <ActivityIndicator color="#3fb950" size="small" />
            ) : (
              <Text style={styles.exportBtnText}>📊 Excel</Text>
            )}
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.exportAccountingBtn, exportingAccounting && styles.btnDisabled]}
              onPress={handleExportAccounting}
              disabled={exportingAccounting}
              activeOpacity={0.7}
            >
              {exportingAccounting ? (
                <ActivityIndicator color="#58a6ff" size="small" />
              ) : (
                <Text style={styles.exportAccountingBtnText}>💰 Contable</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {/* Action filter */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterAction === 'all' && styles.filterChipActive]}
            onPress={() => setFilterAction('all')}
          >
            <Text style={[styles.filterChipText, filterAction === 'all' && styles.filterChipTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterAction === 'compra' && styles.filterChipCompra]}
            onPress={() => setFilterAction('compra')}
          >
            <Text style={[styles.filterChipText, filterAction === 'compra' && styles.filterChipTextActive]}>
              📦 Compras
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterAction === 'retirar' && styles.filterChipEgreso]}
            onPress={() => setFilterAction('retirar')}
          >
            <Text style={[styles.filterChipText, filterAction === 'retirar' && styles.filterChipTextActive]}>
              📤 Egresos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterAction === 'devolver' && styles.filterChipIngreso]}
            onPress={() => setFilterAction('devolver')}
          >
            <Text style={[styles.filterChipText, filterAction === 'devolver' && styles.filterChipTextActive]}>
              📥 Devoluc.
            </Text>
          </TouchableOpacity>
        </View>

        {/* Admin: user filter */}
        {isAdmin && allUsers.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.userFilterScroll}>
            <TouchableOpacity
              style={[styles.userFilterChip, filterUserId === 'all' && styles.userFilterChipActive]}
              onPress={() => setFilterUserId('all')}
            >
              <Text style={[styles.userFilterText, filterUserId === 'all' && styles.userFilterTextActive]}>
                👥 Todos
              </Text>
            </TouchableOpacity>
            {allUsers.map((u) => (
              <TouchableOpacity
                key={u.uid}
                style={[styles.userFilterChip, filterUserId === u.uid && styles.userFilterChipActive]}
                onPress={() => setFilterUserId(u.uid)}
              >
                <Text style={[styles.userFilterText, filterUserId === u.uid && styles.userFilterTextActive]}>
                  {u.displayName.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Item text filter */}
        <TextInput
          style={styles.filterInput}
          placeholder="Filtrar por ítem..."
          placeholderTextColor="#484f58"
          value={filterItem}
          onChangeText={setFilterItem}
        />

        <Text style={styles.resultCount}>
          {filteredMovements.length} movimiento{filteredMovements.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1f6feb" />
          <Text style={styles.loadingText}>Cargando historial...</Text>
        </View>
      ) : filteredMovements.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>Sin movimientos</Text>
          <Text style={styles.emptyText}>
            {movements.length === 0
              ? isAdmin
                ? 'Todavía no se registraron movimientos.'
                : 'Todavía no realizaste ningún movimiento.'
              : 'No hay resultados con los filtros aplicados.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMovements}
          keyExtractor={(item) => item.id}
          renderItem={renderMovement}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
  exportBtn: {
    backgroundColor: '#0d2818',
    borderColor: '#238636',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exportBtnText: {
    color: '#3fb950',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  filterChipActive: {
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
  },
  filterChipEgreso: {
    backgroundColor: '#2d1215',
    borderColor: '#f85149',
  },
  filterChipIngreso: {
    backgroundColor: '#0d2818',
    borderColor: '#238636',
  },
  filterChipCompra: {
    backgroundColor: '#0d1f3a',
    borderColor: '#1f6feb',
  },
  filterChipText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#f0f6fc',
  },
  userFilterScroll: {
    marginBottom: 10,
  },
  userFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    marginRight: 8,
  },
  userFilterChipActive: {
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
  },
  userFilterText: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
  },
  userFilterTextActive: {
    color: '#f0f6fc',
  },
  filterInput: {
    backgroundColor: '#161b22',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  resultCount: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '500',
  },

  // Movement cards
  movementCard: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  egresoCard: {
    borderColor: '#f8514933',
    borderLeftWidth: 3,
    borderLeftColor: '#f85149',
  },
  ingresoCard: {
    borderColor: '#23863633',
    borderLeftWidth: 3,
    borderLeftColor: '#238636',
  },
  compraCard: {
    borderColor: '#1f6feb33',
    borderLeftWidth: 3,
    borderLeftColor: '#1f6feb',
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  egresoBadge: {
    backgroundColor: '#2d1215',
  },
  ingresoBadge: {
    backgroundColor: '#0d2818',
  },
  compraBadge: {
    backgroundColor: '#0d1f3a',
  },
  actionBadgeText: {
    color: '#f0f6fc',
    fontSize: 12,
    fontWeight: '600',
  },
  movementDate: {
    color: '#8b949e',
    fontSize: 12,
  },
  movementItem: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  movementCategory: {
    color: '#58a6ff',
    fontSize: 12,
    marginBottom: 10,
  },
  movementDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
  },
  detailBlock: {
    alignItems: 'center',
  },
  detailLabel: {
    color: '#8b949e',
    fontSize: 11,
    marginBottom: 2,
  },
  detailValue: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  egresoText: {
    color: '#f85149',
  },
  ingresoText: {
    color: '#3fb950',
  },
  compraText: {
    color: '#58a6ff',
  },
  supplierText: {
    color: '#58a6ff',
    fontSize: 12,
    fontWeight: '500',
  },
  exportBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  exportAccountingBtn: {
    backgroundColor: '#0d1f3a',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  exportAccountingBtnText: {
    color: '#58a6ff',
    fontSize: 12,
    fontWeight: '600',
  },
  movementFooter: {
    borderTopWidth: 1,
    borderTopColor: '#21262d',
    paddingTop: 8,
    gap: 4,
  },
  userName: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '500',
  },
  movementNotes: {
    color: '#8b949e',
    fontSize: 12,
    fontStyle: 'italic',
  },

  // List
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },

  // Loading / Empty
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
  },
});
