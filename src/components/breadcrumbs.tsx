import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRight } from '@/components/ui/icons';
import { AppText } from '@/components/ui/primitives';
import { colors, iconSize, spacing } from '@/theme/tokens';

export function Breadcrumbs({
  root,
  path,
  onNavigate,
}: {
  root: string;
  path: string[];
  onNavigate: (path: string[]) => void;
}) {
  const crumbs = [root, ...path];
  return (
    <View style={styles.row} accessibilityLabel="Ubicación">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <View key={`${crumb}-${index}`} style={styles.crumb}>
            {index > 0 && (
              <ChevronRight size={iconSize.sm} color={colors.textSubtle} strokeWidth={2} />
            )}
            <Pressable
              accessibilityRole="link"
              disabled={last}
              onPress={() => onNavigate(path.slice(0, index))}
              style={styles.link}
            >
              <AppText variant="smallStrong" color={last ? colors.text : colors.textMuted}>
                {crumb}
              </AppText>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginRight: spacing.xs },
});
