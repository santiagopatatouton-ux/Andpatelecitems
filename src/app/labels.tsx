import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '@/components/layout/screen';
import { Printer, QrCode } from '@/components/ui/icons';
import { AppText, Button, Card, EmptyState } from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCatalog } from '@/context/catalog-context';
import { colors, spacing } from '@/theme/tokens';
import { itemUrl, printLabels, qrShape, type Label } from '@/utils/qr-labels';

function parsePath(raw: string | undefined): string[] {
  try {
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function LabelCard({ label }: { label: Label }) {
  const { size, d } = useMemo(() => qrShape(itemUrl(label.path)), [label.path]);
  return (
    <Card style={styles.label}>
      <Svg width={96} height={96} viewBox={`-2 -2 ${size + 4} ${size + 4}`}>
        <Path d={d} fill={colors.text} />
      </Svg>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {label.name}
        </AppText>
        <AppText variant="small" color={colors.textMuted} numberOfLines={3}>
          {label.detail}
        </AppText>
        {label.code ? (
          <AppText variant="small" color={colors.textMuted}>
            {`Código: ${label.code}`}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

export default function LabelsScreen() {
  const { isAdmin, loading } = useAuth();
  const { items } = useCatalog();
  const params = useLocalSearchParams<{ path: string }>();
  const base = useMemo(() => parsePath(params.path), [params.path]);

  const labels: Label[] = useMemo(
    () =>
      items
        .filter((item) => base.every((name, index) => item.path[index] === name))
        .map((item) => ({
          name: item.name,
          detail: item.path.slice(0, -1).join(' › '),
          code: item.code,
          path: item.path,
        })),
    [items, base]
  );

  if (loading) return <View />;
  if (!isAdmin) return <Redirect href="/" />;

  return (
    <Screen
      title="Etiquetas QR"
      subtitle={base.join(' › ') || 'Todo el catálogo'}
      backTo="/admin"
      actions={
        Platform.OS === 'web' && labels.length > 0 ? (
          <Button label="Imprimir" icon={Printer} onPress={() => printLabels(labels)} />
        ) : undefined
      }
    >
      {labels.length === 0 ? (
        <EmptyState icon={QrCode} title="No hay ítems en esta carpeta" />
      ) : (
        <>
          <AppText color={colors.textMuted}>
            {`${labels.length} ${labels.length === 1 ? 'etiqueta' : 'etiquetas'}. Al escanear con la cámara del teléfono se abre el ítem.`}
          </AppText>
          <View style={styles.grid}>
            {labels.map((label) => (
              <LabelCard key={label.path.join('/')} label={label} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  label: {
    flexGrow: 1,
    flexBasis: 280,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
