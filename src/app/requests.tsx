import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../utils/auth-context';

interface Requisition {
  id: string;
  docId: string;
  itemName: string;
  path: string[];
  requestedQuantity: number;
  notes: string;
  status: 'pending' | 'completed' | 'rejected';
  requestedBy: string;
  timestamp: any;
}

export default function RequestsScreen() {
  const [requests, setRequests] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert('Acceso Denegado', 'Solo los administradores pueden ver las solicitudes.');
      if (router.canGoBack()) router.back(); else router.replace('/');
      return;
    }

    const q = query(collection(db, 'requisitions'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Requisition[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as Requisition);
      });
      setRequests(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching requests:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleUpdateStatus = async (id: string, newStatus: 'completed' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'requisitions', id), {
        status: newStatus
      });
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'No se pudo actualizar el estado.');
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Fecha desconocida';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const renderItem = ({ item }: { item: Requisition }) => {
    const isPending = item.status === 'pending';
    const isCompleted = item.status === 'completed';

    let statusColor = '#d29922';
    let statusText = 'Pendiente';
    if (isCompleted) {
      statusColor = '#3fb950';
      statusText = 'Completado';
    } else if (item.status === 'rejected') {
      statusColor = '#f85149';
      statusText = 'Rechazado';
    }

    return (
      <View style={[styles.card, !isPending && styles.cardResolved]}>
        <View style={styles.cardHeader}>
          <Text style={styles.itemName}>{item.itemName}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor }]}>
            <Text style={styles.badgeText}>{statusText}</Text>
          </View>
        </View>

        <Text style={styles.pathText}>Ubicación sugerida: {item.path.join(' › ')}</Text>
        
        <View style={styles.detailsRow}>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Cantidad Pedida</Text>
            <Text style={styles.detailValue}>{item.requestedQuantity}</Text>
          </View>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Solicitante</Text>
            <Text style={styles.detailValueSub}>{item.requestedBy.split('@')[0]}</Text>
          </View>
        </View>

        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Fecha:</Text>
          <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
        </View>

        {item.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notas adicionales:</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        ) : null}

        {isPending && (
          <View style={styles.actionsRow}>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.btnReject]} 
              onPress={() => handleUpdateStatus(item.id, 'rejected')}
            >
              <Text style={styles.actionBtnText}>Rechazar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionBtn, styles.btnComplete]} 
              onPress={() => handleUpdateStatus(item.id, 'completed')}
            >
              <Text style={styles.actionBtnText}>Marcar Comprado</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Solicitudes de Compra</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00e5ff" />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyText}>No hay solicitudes de compra.</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
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
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#8b949e', fontSize: 16 },
  listContent: { padding: 16, paddingBottom: 40 },
  
  card: { backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
  cardResolved: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { color: '#f0f6fc', fontSize: 18, fontWeight: 'bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
  pathText: { color: '#8b949e', fontSize: 13, marginBottom: 16 },
  
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#0d1117', borderRadius: 8, padding: 12, marginBottom: 12 },
  detailBox: { alignItems: 'center', flex: 1 },
  detailLabel: { color: '#8b949e', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' },
  detailValue: { color: '#f0f6fc', fontSize: 18, fontWeight: 'bold' },
  detailValueSub: { color: '#58a6ff', fontSize: 15, fontWeight: '600' },
  
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  dateLabel: { color: '#8b949e', fontSize: 13 },
  dateText: { color: '#c9d1d9', fontSize: 13, fontWeight: '500' },
  
  notesBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#21262d' },
  notesLabel: { color: '#8b949e', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  notesText: { color: '#f0f6fc', fontSize: 14, fontStyle: 'italic' },
  
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#21262d' },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnReject: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#f85149' },
  btnComplete: { backgroundColor: '#238636' },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
