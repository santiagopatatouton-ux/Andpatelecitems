import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CircleAlert, ScrollText } from '@/components/ui/icons';
import {
  AppText,
  Card,
  Divider,
  EmptyState,
  Loading,
  SectionTitle,
} from '@/components/ui/primitives';
import { db } from '@/lib/firebase';
import { colors, spacing } from '@/theme/tokens';
import { getAuditActionLabel, type AuditAction } from '@/utils/audit-log';
import { formatDateTime } from '@/utils/format';

const VISIBLE_EVENTS = 100;

interface AuditEntry {
  id: string;
  action: AuditAction;
  adminName: string;
  target: string;
  details?: string;
  timestamp: never;
}

export function AuditAdmin() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const source = query(
      collection(db, 'audit_log'),
      orderBy('timestamp', 'desc'),
      limit(VISIBLE_EVENTS)
    );
    return onSnapshot(
      source,
      (snapshot) => {
        setEntries(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AuditEntry));
        setFailed(false);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading audit log:', error);
        setFailed(true);
        setLoading(false);
      }
    );
  }, []);

  if (loading) return <Loading label="Cargando auditoría" />;
  if (failed) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="No se pudo cargar la auditoría"
        message="Revisá la conexión y volvé a entrar."
      />
    );
  }

  return (
    <>
      <SectionTitle title="Historial de cambios" hint={`Últimos ${VISIBLE_EVENTS} eventos`} />
      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="Sin eventos de auditoría" />
      ) : (
        <Card style={styles.list}>
          {entries.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 && <Divider />}
              <View style={styles.row}>
                <View style={styles.top}>
                  <AppText variant="bodyStrong" style={styles.flex}>
                    {getAuditActionLabel(entry.action)}
                  </AppText>
                  <AppText variant="small" color={colors.textMuted}>
                    {formatDateTime(entry.timestamp)}
                  </AppText>
                </View>
                <AppText>{entry.target}</AppText>
                {entry.details ? (
                  <AppText variant="small" color={colors.textMuted}>
                    {entry.details}
                  </AppText>
                ) : null}
                <AppText variant="small" color={colors.textMuted}>
                  {`Por ${entry.adminName || 'Sistema'}`}
                </AppText>
              </View>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { padding: 0, overflow: 'hidden' },
  row: { gap: 2, padding: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
