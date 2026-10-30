import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter, usePathname, useFocusEffect } from 'expo-router';
import { useAuth } from '../context/auth-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

const CART_STORAGE_KEY = 'andpatelec_cart';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin, signOut, userProfile } = useAuth();
  const [cartCount, setCartCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // Load cart count
  const loadCartCount = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem(CART_STORAGE_KEY);
      const items = json ? JSON.parse(json) : [];
      setCartCount(items.length);
    } catch {
      setCartCount(0);
    }
  }, []);

  // Refresh cart count when nav renders or route changes
  useFocusEffect(
    useCallback(() => {
      loadCartCount();
    }, [loadCartCount])
  );

  // Also poll periodically to catch updates from action screen
  useEffect(() => {
    const interval = setInterval(loadCartCount, 2000);
    return () => clearInterval(interval);
  }, [loadCartCount]);

  // Subscribe to pending orders count from Firestore
  useEffect(() => {
    if (!isAdmin && !userProfile?.uid) {
      return;
    }

    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('status', '==', 'pending'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (isAdmin) {
          setPendingOrdersCount(snapshot.docs.length);
        } else {
          const userPending = snapshot.docs.filter(
            (d) => d.data().userId === userProfile?.uid
          );
          setPendingOrdersCount(userPending.length);
        }
      },
      (error) => {
        console.error('Error loading pending orders count:', error);
        setPendingOrdersCount(0);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, userProfile?.uid]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      console.error('Error signing out:', e);
    }
  };

  // Determine the badge for the Pedidos tab
  // Show pending orders count (from Firestore) — this is the real count
  const ordersBadge = pendingOrdersCount > 0 ? pendingOrdersCount : undefined;
  // Show cart count on a separate cart entry if there are items
  const cartBadge = cartCount > 0 ? cartCount : undefined;

  const navItems = [
    { name: 'Catálogo', path: '/', icon: '📦' },
    { name: 'Favoritos', path: '/favorites', icon: '⭐' },
    { name: 'Carrito', path: '/cart', icon: '🛒', badge: cartBadge },
    { name: 'Pedidos', path: '/orders', icon: '📋', badge: ordersBadge },
    { name: 'Historial', path: '/history', icon: '📜' },
  ];

  if (isAdmin) {
    navItems.push({ name: 'Admin', path: '/admin', icon: '⚙️' });
  }

  return (
    <View style={styles.container}>
      {navItems.map((item) => {
        const isActive = pathname === item.path;
        return (
          <TouchableOpacity
            key={item.path}
            style={styles.navItem}
            onPress={() => {
              if (!isActive) router.replace(item.path as any);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, isActive && styles.iconContainerActive]}>
              <Text style={[styles.icon, isActive && styles.iconActive]}>{item.icon}</Text>
              {item.badge !== undefined && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.text, isActive && styles.textActive]}>{item.name}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={styles.navItem} onPress={handleLogout} activeOpacity={0.7}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🚪</Text>
        </View>
        <Text style={styles.text}>Salir</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#161b22',
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12, // Safe area bottom
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  iconContainerActive: {
    backgroundColor: '#1f6feb33',
  },
  icon: {
    fontSize: 18,
    opacity: 0.7,
  },
  iconActive: {
    opacity: 1,
  },
  text: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '500',
  },
  textActive: {
    color: '#58a6ff',
    fontWeight: 'bold',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#d29922',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
