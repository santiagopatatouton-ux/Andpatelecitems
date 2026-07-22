import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface Movement {
  id: string;
  path: string[];
  action: 'retirar' | 'devolver';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  notes?: string;
  userId?: string;
  userName?: string;
  timestamp: any;
}

export default function HistoryScreen() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const q = query(
      collection(db, 'movements'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Movement[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Movement);
      });
      setMovements(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching history:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Fecha desconocida';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const handleExportCSV = () => {
    try {
      if (movements.length === 0) {
        Alert.alert('Vacío', 'No hay movimientos para exportar.');
        return;
      }
      
      const rows: string[] = [];
      // Header
      rows.push(['Fecha', 'Accion', 'Item', 'Ruta', 'Cantidad', 'Stock_Final', 'Usuario', 'Notas'].join(','));

      movements.forEach(m => {
        const date = formatDate(m.timestamp);
        const action = m.action;
        const itemName = m.path[m.path.length - 1] || 'Desconocido';
        const pathStr = m.path.join(' > ');
        const qty = m.quantity;
        const stockAfter = m.stockAfter;
        const user = m.userName || 'Desconocido';
        const notes = m.notes || '';

        const safeDate = `"${date}"`;
        const safePath = `"${pathStr.replace(/"/g, '""')}"`;
        const safeName = `"${itemName.replace(/"/g, '""')}"`;
        const safeUser = `"${user.replace(/"/g, '""')}"`;
        const safeNotes = `"${notes.replace(/"/g, '""')}"`;

        rows.push([safeDate, action, safeName, safePath, qty, stockAfter, safeUser, safeNotes].join(','));
      });
      
      const csvContent = rows.join('\n');
      
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `historial_movimientos_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        Alert.alert('Exportar', 'La exportación directa solo está disponible en la versión web.');
      }
    } catch (error) {
      console.error('Error exporting:', error);
      Alert.alert('Error', 'No se pudo exportar el archivo CSV.');
    }
  };

  const renderItem = ({ item }: { item: Movement }) => {
    const isRetiro = item.action === 'retirar';
    const itemName = item.path[item.path.length - 1];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.actionBadge}>
            <Text style={styles.actionIcon}>{isRetiro ? '📤' : '📥'}</Text>
            <Text style={[styles.actionText, isRetiro ? styles.textRed : styles.textGreen]}>
              {isRetiro ? 'Retiro' : 'Devolución'}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
        </View>

        <Text style={styles.itemName}>{itemName}</Text>
        <Text style={styles.pathText}>{item.path.slice(0, -1).join(' › ')}</Text>

        <View style={styles.detailsRow}>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Cantidad</Text>
            <Text style={styles.detailValue}>{isRetiro ? '-' : '+'}{item.quantity}</Text>
          </View>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Stock final</Text>
            <Text style={styles.detailValue}>{item.stockAfter}</Text>
          </View>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Usuario</Text>
            <Text style={styles.detailUser} numberOfLines={1}>
              {item.userName ? item.userName.split('@')[0] : 'Desconocido'}
            </Text>
          </View>
        </View>

        {item.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notas:</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historial</Text>
        <TouchableOpacity onPress={handleExportCSV} style={styles.exportIconBtn}>
          <Text style={styles.exportIconText}>📥 CSV</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00e5ff" />
        </View>
      ) : movements.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No hay movimientos registrados</Text>
        </View>
      ) : (
        <FlatList
          data={movements}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#8b949e',
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    paddingBottom: 12,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  textRed: { color: '#f85149' },
  textGreen: { color: '#3fb950' },
  dateText: {
    color: '#8b949e',
    fontSize: 12,
  },
  itemName: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pathText: {
    color: '#8b949e',
    fontSize: 12,
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0d1117',
    borderRadius: 8,
    padding: 12,
  },
  detailBox: {
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    color: '#8b949e',
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  detailUser: {
    color: '#58a6ff',
    fontSize: 14,
    fontWeight: '600',
  },
  notesBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
  },
  notesLabel: {
    color: '#8b949e',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  notesText: {
    color: '#c9d1d9',
    fontSize: 14,
    fontStyle: 'italic',
  },
  exportIconBtn: {
    paddingVertical: 6,
    paddingLeft: 12,
    width: 70,
    alignItems: 'flex-end',
  },
  exportIconText: {
    color: '#3fb950',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
