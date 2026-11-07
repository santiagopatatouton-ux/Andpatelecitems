import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import React, { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Boxes,
  ClipboardList,
  History,
  LogOut,
  Settings,
  ShoppingCart,
  Star,
  Zap,
  type IconComponent,
} from '@/components/ui/icons';
import { AppText } from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCart } from '@/context/cart-context';
import { db } from '@/lib/firebase';
import { colors, iconSize, iconStroke, layout, radius, spacing } from '@/theme/tokens';
import { initials, toMillis } from '@/utils/format';

interface NavItem {
  label: string;
  href: string;
  icon: IconComponent;
  badge?: number;
  /** Otras rutas que pertenecen a esta sección. */
  alsoActiveOn?: string[];
}

export function useIsWide() {
  return useWindowDimensions().width >= layout.sidebarBreakpoint;
}

/** Aviso de pedidos: pendientes para un admin; resueltos sin ver para un empleado. */
function useOrdersBadge() {
  const { isAdmin, userProfile } = useAuth();
  const pathname = usePathname();
  const uid = userProfile?.uid;
  const onOrders = pathname === '/orders';
  const [orders, setOrders] = useState<DocumentData[]>([]);
  const [seenAt, setSeenAt] = useState(Number.MAX_SAFE_INTEGER);

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'orders');
    const source = isAdmin
      ? query(ref, where('status', '==', 'pending'))
      : query(ref, where('userId', '==', uid));

    return onSnapshot(
      source,
      (snapshot) => setOrders(snapshot.docs.map((order) => order.data())),
      (error) => console.error('Error loading orders badge:', error)
    );
  }, [isAdmin, uid]);

  // Abrir Pedidos marca lo resuelto como visto, también en la próxima sesión.
  useEffect(() => {
    if (!uid || isAdmin) return;
    const key = `andpatelec_orders_seen_${uid}`;
    const now = Date.now();
    const update = onOrders
      ? AsyncStorage.setItem(key, String(now)).then(() => now)
      : AsyncStorage.getItem(key).then((value) => Number(value ?? 0));
    update.then(setSeenAt).catch((error) => console.error('Error loading orders seen:', error));
  }, [uid, isAdmin, onOrders]);

  if (isAdmin) return orders.length;
  if (onOrders) return 0;
  return orders.filter((order) => toMillis(order.resolvedAt) > seenAt).length;
}

function useNavItems(): NavItem[] {
  const { items } = useCart();
  const ordersBadge = useOrdersBadge();
  return [
    { label: 'Catálogo', href: '/', icon: Boxes, alsoActiveOn: ['/action'] },
    { label: 'Favoritos', href: '/favorites', icon: Star },
    { label: 'Carrito', href: '/cart', icon: ShoppingCart, badge: items.length },
    { label: 'Pedidos', href: '/orders', icon: ClipboardList, badge: ordersBadge },
    { label: 'Historial', href: '/history', icon: History },
  ];
}

const isActive = (item: NavItem, pathname: string) =>
  pathname === item.href || !!item.alsoActiveOn?.includes(pathname);

function NavBadge({ count }: { count: number }) {
  return (
    <View style={styles.badge}>
      <AppText variant="caption" color={colors.onBrand} tabular>
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <View style={[styles.brandMark, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Zap size={size * 0.58} color={colors.onBrand} fill={colors.onBrand} strokeWidth={iconStroke} />
    </View>
  );
}

function SidebarLink({
  item,
  active,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  onPress: () => void;
}) {
  const Icon = item.icon;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={(state) => [
        styles.sidebarLink,
        ((state as { hovered?: boolean }).hovered || state.pressed) && styles.sidebarLinkHover,
        active && styles.sidebarLinkActive,
      ]}
    >
      <Icon
        size={iconSize.md}
        color={active ? colors.brand : colors.onInkMuted}
        strokeWidth={iconStroke}
      />
      <AppText
        variant="bodyStrong"
        color={active ? colors.onInk : colors.onInkMuted}
        style={styles.flex}
      >
        {item.label}
      </AppText>
      {!!item.badge && <NavBadge count={item.badge} />}
    </Pressable>
  );
}

function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin, userProfile, signOut } = useAuth();
  const items = useNavItems();
  const go = (href: string) => router.replace(href as never);
  const adminItem: NavItem = { label: 'Administración', href: '/admin', icon: Settings };

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <BrandMark />
        <View>
          <AppText variant="heading" color={colors.onInk}>
            Andpatelec
          </AppText>
          <AppText variant="caption" color={colors.onInkMuted}>
            Control de stock
          </AppText>
        </View>
      </View>

      <View style={styles.sidebarNav}>
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isActive(item, pathname)}
            onPress={() => go(item.href)}
          />
        ))}
        {isAdmin && (
          <SidebarLink
            item={adminItem}
            active={isActive(adminItem, pathname)}
            onPress={() => go(adminItem.href)}
          />
        )}
      </View>

      <View style={styles.sidebarFooter}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Mi cuenta"
          onPress={() => go('/account')}
          style={(state) => [
            styles.sidebarUser,
            ((state as { hovered?: boolean }).hovered || state.pressed) && styles.sidebarLinkHover,
            pathname === '/account' && styles.sidebarLinkActive,
          ]}
        >
          <View style={styles.sidebarAvatar}>
            <AppText variant="smallStrong" color={colors.onInk}>
              {initials(userProfile?.displayName ?? '')}
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="smallStrong" color={colors.onInk} numberOfLines={1}>
              {userProfile?.displayName}
            </AppText>
            <AppText variant="caption" color={colors.onInkMuted}>
              {isAdmin ? 'Administrador' : 'Empleado'}
            </AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          onPress={signOut}
          style={(state) => [
            styles.sidebarLink,
            ((state as { hovered?: boolean }).hovered || state.pressed) && styles.sidebarLinkHover,
          ]}
        >
          <LogOut size={iconSize.md} color={colors.onInkMuted} strokeWidth={iconStroke} />
          <AppText variant="bodyStrong" color={colors.onInkMuted}>
            Cerrar sesión
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function BottomTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const items = useNavItems();

  return (
    <View style={[styles.tabs, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {items.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        return (
          <Pressable
            key={item.href}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (pathname !== item.href) router.replace(item.href as never);
            }}
            style={styles.tab}
          >
            <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} />
            <View>
              <Icon
                size={22}
                color={active ? colors.text : colors.textSubtle}
                strokeWidth={iconStroke}
              />
              {!!item.badge && (
                <View style={styles.tabBadge}>
                  <NavBadge count={item.badge} />
                </View>
              )}
            </View>
            <AppText
              variant="caption"
              color={active ? colors.text : colors.textSubtle}
              numberOfLines={1}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Barra lateral en pantallas anchas y pestañas abajo en el teléfono. */
export function AppShell({ children }: { children: ReactNode }) {
  const wide = useIsWide();
  const { userProfile } = useAuth();
  const pathname = usePathname();
  const showNavigation = !!userProfile && pathname !== '/login';

  return (
    <View style={styles.shell}>
      {showNavigation && wide && <Sidebar />}
      <View style={styles.flex}>
        <View style={styles.flex}>{children}</View>
        {showNavigation && !wide && <BottomTabs />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },

  brandMark: {
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sidebar: {
    width: layout.sidebarWidth,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
  },
  sidebarNav: { flex: 1, gap: spacing.xs },
  sidebarLink: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  sidebarLinkHover: { backgroundColor: colors.inkRaised },
  sidebarLinkActive: { backgroundColor: colors.inkRaised },
  sidebarFooter: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.inkBorder,
  },
  sidebarUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  sidebarAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.inkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: spacing.xs,
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    width: 32,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  tabIndicatorActive: { backgroundColor: colors.brand },
  tabBadge: { position: 'absolute', top: -8, right: -14 },
});
