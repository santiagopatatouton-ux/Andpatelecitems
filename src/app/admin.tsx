import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Boxes, ScrollText, Users } from '@/components/ui/icons';
import { Segmented } from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { AuditAdmin } from '@/features/admin/audit-admin';
import { CatalogAdmin } from '@/features/admin/catalog-admin';
import { UsersAdmin } from '@/features/admin/users-admin';

type AdminTab = 'catalog' | 'users' | 'audit';

const TABS = [
  { value: 'catalog' as const, label: 'Catálogo', icon: Boxes },
  { value: 'users' as const, label: 'Usuarios', icon: Users },
  { value: 'audit' as const, label: 'Auditoría', icon: ScrollText },
];

export default function AdminScreen() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<AdminTab>('catalog');

  if (loading) return <View />;
  if (!isAdmin) return <Redirect href="/" />;

  return (
    <Screen title="Administración">
      <Segmented options={TABS} value={tab} onChange={setTab} />
      {tab === 'catalog' && <CatalogAdmin />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'audit' && <AuditAdmin />}
    </Screen>
  );
}
