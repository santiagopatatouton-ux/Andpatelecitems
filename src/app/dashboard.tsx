import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../utils/auth-context';

export default function DashboardScreen() {
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert('Acceso Denegado', 'Solo los administradores pueden ver el dashboard.');
      if (router.canGoBack()) router.back(); else router.replace('/');
      return;
    }

    const unsubTree = onSnapshot(doc(db, 'catalog', 'tree'), (snapshot) => {
      if (snapshot.exists()) {
        setCatalogTree(snapshot.data() as Record<string, any>);
      }
      setLoading(false);
    });

    const unsubStock = onSnapshot(collection(db, 'stock'), (snapshot) => {
      const smap: Record<string, any> = {};
      snapshot.forEach(doc => {
        smap[doc.id] = doc.data();
      });
      setStockMap(smap);
    });

    return () => {
      unsubTree();
      unsubStock();
    };
  }, [isAdmin]);

  const metrics = useMemo(() => {
    let totalItems = 0;
    let totalUnits = 0;
    let totalValue = 0;

    Object.values(stockMap).forEach((item: any) => {
      totalItems++;
      const s = item.stock || 0;
      const c = item.unitCost || 0;
      totalUnits += s;
      totalValue += s * c;
    });

    return { totalItems, totalUnits, totalValue };
  }, [stockMap]);

  const handleExportCSV = () => {
    try {
      if (!catalogTree) return;
      
      const rows: string[] = [];
      // Header
      rows.push(['Ubicacion', 'Nombre_Item', 'Stock', 'Costo_Unitario', 'Valor_Total'].join(','));

      const traverse = (node: any, currentPath: string[]) => {
        if (node === undefined || node === null) return;
        
        if (Array.isArray(node)) {
          node.forEach(itemName => {
            const fullPath = [...currentPath, itemName].join(' > ');
            const docId = itemName.trim().toLowerCase().replace(/[\/\.]/g, '_');
            const data = stockMap[docId] || {};
            const stock = data.stock || 0;
            const cost = data.unitCost || 0;
            const val = stock * cost;
            
            // Escape quotes and commas
            const safePath = `"${fullPath.replace(/"/g, '""')}"`;
            const safeName = `"${itemName.replace(/"/g, '""')}"`;
            
            rows.push([safePath, safeName, stock, cost, val].join(','));
          });
        } else if (typeof node === 'object') {
          Object.keys(node).forEach(key => {
            traverse(node[key], [...currentPath, key]);
          });
        }
      };

      traverse(catalogTree, []);
      
      const csvContent = rows.join('\n');
      
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `inventario_${new Date().toISOString().split('T')[0]}.csv`);
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

  const formatCurrency = (val: number) => {
    return val.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00e5ff" />
        </View>
      ) : (
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen del Inventario</Text>
            
            <View style={styles.metricRow}>
              <View style={styles.metricIconBox}><Text style={styles.metricIcon}>📦</Text></View>
              <View style={styles.metricData}>
                <Text style={styles.metricLabel}>Total de Productos Únicos</Text>
                <Text style={styles.metricValue}>{metrics.totalItems}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={[styles.metricIconBox, { backgroundColor: '#1f6feb' }]}><Text style={styles.metricIcon}>🔢</Text></View>
              <View style={styles.metricData}>
                <Text style={styles.metricLabel}>Unidades Físicas Totales</Text>
                <Text style={styles.metricValue}>{metrics.totalUnits}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={[styles.metricIconBox, { backgroundColor: '#238636' }]}><Text style={styles.metricIcon}>💰</Text></View>
              <View style={styles.metricData}>
                <Text style={styles.metricLabel}>Valorización Total Estimada</Text>
                <Text style={styles.metricValueTotal}>{formatCurrency(metrics.totalValue)}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV} activeOpacity={0.8}>
            <Text style={styles.exportBtnIcon}>📊</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.exportBtnText}>Descargar Reporte CSV</Text>
              <Text style={styles.exportBtnSub}>Exportar inventario actual a Excel</Text>
            </View>
            <Text style={styles.chevron}>⬇️</Text>
          </TouchableOpacity>
        </ScrollView>
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
  scrollContent: { padding: 16 },
  
  summaryCard: { backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 24 },
  summaryTitle: { color: '#f0f6fc', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  
  metricRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  metricIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#8b949e', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  metricIcon: { fontSize: 24 },
  metricData: { flex: 1 },
  metricLabel: { color: '#8b949e', fontSize: 13, textTransform: 'uppercase', marginBottom: 4, fontWeight: '600' },
  metricValue: { color: '#f0f6fc', fontSize: 28, fontWeight: 'bold' },
  metricValueTotal: { color: '#3fb950', fontSize: 28, fontWeight: 'bold' },
  
  exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f3a5f', borderColor: '#1f6feb', borderWidth: 1, borderRadius: 12, padding: 16 },
  exportBtnIcon: { fontSize: 32, marginRight: 16 },
  exportBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  exportBtnSub: { color: '#8b949e', fontSize: 13 },
  chevron: { fontSize: 20 },
});
