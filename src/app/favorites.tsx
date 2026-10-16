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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../context/auth-context';

interface Favorite {
  id: string;
  path: string[];
  name: string;
  addedAt: any;
}

export default function FavoritesScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to user's favorites
  useEffect(() => {
    if (!userProfile?.uid) return;

    const favsRef = collection(db, 'users', userProfile.uid, 'favorites');
    const q = query(favsRef, orderBy('addedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Favorite[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Favorite[];
        setFavorites(items);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading favorites:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userProfile?.uid]);

  const handleRemoveFavorite = async (fav: Favorite) => {
    if (!userProfile?.uid) return;

    const doRemove = async () => {
      try {
        await deleteDoc(doc(db, 'users', userProfile.uid, 'favorites', fav.id));
      } catch (error) {
        console.error('Error removing favorite:', error);
        Alert.alert('Error', 'No se pudo quitar de favoritos.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`¿Quitar "${fav.name}" de favoritos?`);
      if (confirmed) doRemove();
    } else {
      Alert.alert('Quitar favorito', `¿Quitar "${fav.name}" de favoritos?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const handleNavigateToItem = (fav: Favorite) => {
    router.push({
      pathname: '/action',
      params: { path: JSON.stringify(fav.path) },
    });
  };

  const renderFavorite = ({ item }: { item: Favorite }) => {
    const category = item.path.slice(0, -1).join(' › ');

    return (
      <TouchableOpacity
        style={styles.favCard}
        onPress={() => handleNavigateToItem(item)}
        activeOpacity={0.7}
      >
        <View style={styles.favContent}>
          <Text style={styles.favIcon}>⭐</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.favName}>{item.name}</Text>
            <Text style={styles.favPath}>{category}</Text>
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemoveFavorite(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⭐</Text>
        <Text style={styles.headerTitle}>Favoritos</Text>
        <Text style={styles.headerCount}>
          {favorites.length} ítem{favorites.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#d29922" />
          <Text style={styles.loadingText}>Cargando favoritos...</Text>
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>⭐</Text>
          <Text style={styles.emptyTitle}>Sin favoritos</Text>
          <Text style={styles.emptyText}>
            Marcá ítems como favoritos desde la pantalla de cada artículo para acceder a ellos rápidamente.
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={renderFavorite}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    gap: 10,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    color: '#f0f6fc',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  headerCount: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '500',
  },

  // Favorite cards
  favCard: {
    backgroundColor: '#161b22',
    borderColor: '#d2992233',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  favContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  favIcon: {
    fontSize: 22,
  },
  favName: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: '600',
  },
  favPath: {
    color: '#58a6ff',
    fontSize: 12,
    marginTop: 2,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#21262d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: 'bold',
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
    lineHeight: 20,
  },
});
