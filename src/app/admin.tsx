import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import {
  Boxes,
  ClipboardList,
  HardHat,
  LayoutDashboard,
  ScrollText,
  Users,
} from '@/components/ui/icons';
import { Chip } from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { AuditAdmin } from '@/features/admin/audit-admin';
import { CatalogAdmin } from '@/features/admin/catalog-admin';
import { CountAdmin } from '@/features/admin/count-admin';
import { ObrasAdmin } from '@/features/admin/obras-admin';
import { SummaryAdmin } from '@/features/admin/summary-admin';
import { UsersAdmin } from '@/features/admin/users-admin';
import { spacing } from '@/theme/tokens';

type AdminTab = 'summary' | 'catalog' | 'count' | 'obras' | 'users' | 'audit';

const TABS = [
  { value: 'summary' as const, label: 'Resumen', icon: LayoutDashboard },
  { value: 'catalog' as const, label: 'Catálogo', icon: Boxes },
  { value: 'count' as const, label: 'Conteo', icon: ClipboardList },
  { value: 'obras' as const, label: 'Obras', icon: HardHat },
  { value: 'users' as const, label: 'Usuarios', icon: Users },
  { value: 'audit' as const, label: 'Auditoría', icon: ScrollText },
];

export default function AdminScreen() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<AdminTab>('summary');

  if (loading) return <View />;
  if (!isAdmin) return <Redirect href="/" />;

  return (
    <Screen title="Administración">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabsScroll}
      >
        {TABS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={tab === option.value}
            onPress={() => setTab(option.value)}
          />
        ))}
      </ScrollView>
      {tab === 'summary' && <SummaryAdmin />}
      {tab === 'catalog' && <CatalogAdmin />}
      {tab === 'count' && <CountAdmin />}
      {tab === 'obras' && <ObrasAdmin />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'audit' && <AuditAdmin />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: spacing.sm },
  tabsScroll: { flexGrow: 0 },
});
