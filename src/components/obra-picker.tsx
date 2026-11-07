import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Chip } from '@/components/ui/primitives';
import { useObras, type Obra } from '@/hooks/use-obras';
import { spacing } from '@/theme/tokens';

/** Elegir la obra es opcional. Si no hay obras activas no ocupa lugar. */
export function ObraPicker({
  value,
  onChange,
}: {
  value: Obra | null;
  onChange: (obra: Obra | null) => void;
}) {
  const { obras } = useObras();
  const active = obras.filter((obra) => obra.activa);
  if (!active.length) return null;

  return (
    <View style={styles.field}>
      <AppText variant="smallStrong">Obra (opcional)</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip label="Sin obra" selected={!value} onPress={() => onChange(null)} />
        {active.map((obra) => (
          <Chip
            key={obra.id}
            label={obra.nombre}
            selected={value?.id === obra.id}
            onPress={() => onChange(obra)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  chips: { gap: spacing.sm },
});
