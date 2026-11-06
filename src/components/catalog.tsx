import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Archive,
  Bolt,
  Cable,
  ChevronRight,
  CircuitBoard,
  Folder,
  Layers,
  Lightbulb,
  Package,
  ShieldCheck,
  ToggleRight,
  Wrench,
  type IconComponent,
} from '@/components/ui/icons';
import { AppText, Badge } from '@/components/ui/primitives';
import { colors, iconSize, iconStroke, radius, spacing, toneColors } from '@/theme/tokens';
import {
  formatNumber,
  STOCK_LEVEL_LABELS,
  STOCK_LEVEL_TONES,
  type StockLevel,
} from '@/utils/format';
import { getUnit } from '@/utils/units';

function CategoryGlyph({ name }: { name: string }) {
  const icon = categoryIcon(name);
  return React.createElement(icon, {
    size: iconSize.md,
    color: colors.text,
    strokeWidth: iconStroke,
  });
}

const CATEGORY_ICONS: [RegExp, IconComponent][] = [
  [/cable/i, Cable],
  [/canaliza/i, Layers],
  [/protecci/i, ShieldCheck],
  [/llave|cambre/i, ToggleRight],
  [/ilumina/i, Lightbulb],
  [/herramient/i, Wrench],
  [/buloner/i, Bolt],
  [/caja|gabinete/i, Archive],
  [/tablero/i, CircuitBoard],
  [/vario/i, Package],
];

export function categoryIcon(name: string): IconComponent {
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Folder;
}

type HoverState = { pressed: boolean; hovered?: boolean };

export function CategoryCard({
  name,
  detail,
  onPress,
}: {
  name: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${detail}`}
      onPress={onPress}
      style={(state) => [
        styles.categoryCard,
        ((state as HoverState).hovered || state.pressed) && styles.cardHover,
      ]}
    >
      <View style={styles.categoryIcon}>
        <CategoryGlyph name={name} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {name}
        </AppText>
        <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
          {detail}
        </AppText>
      </View>
      <ChevronRight size={iconSize.md} color={colors.textSubtle} strokeWidth={iconStroke} />
    </Pressable>
  );
}

export function ItemRow({
  name,
  detail,
  stock,
  level,
  unit,
  onPress,
}: {
  name: string;
  detail?: string;
  stock: number;
  level: StockLevel;
  unit?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${formatNumber(stock)} en stock, ${STOCK_LEVEL_LABELS[level]}`}
      onPress={onPress}
      style={(state) => [
        styles.row,
        ((state as HoverState).hovered || state.pressed) && styles.rowHover,
      ]}
    >
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {name}
        </AppText>
        {detail ? (
          <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <View style={styles.stockColumn}>
        <AppText variant="heading" tabular>
          {formatNumber(stock)}
          <AppText variant="small" color={colors.textMuted}>
            {` ${getUnit(unit).short}`}
          </AppText>
        </AppText>
        <Badge label={STOCK_LEVEL_LABELS[level]} tone={STOCK_LEVEL_TONES[level]} />
      </View>
      <ChevronRight size={iconSize.md} color={colors.textSubtle} strokeWidth={iconStroke} />
    </Pressable>
  );
}

export function StatTile({
  label,
  value,
  level,
  selected,
  onPress,
}: {
  label: string;
  value: number;
  level: StockLevel;
  selected: boolean;
  onPress: () => void;
}) {
  const accent = toneColors[STOCK_LEVEL_TONES[level]].fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [
        styles.stat,
        ((state as HoverState).hovered || state.pressed) && styles.cardHover,
        selected && styles.statSelected,
      ]}
    >
      <View style={styles.statLabel}>
        <View style={[styles.statDot, { backgroundColor: accent }]} />
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.flex}>
          {label}
        </AppText>
      </View>
      <AppText variant="title" tabular>
        {value}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cardHover: { borderColor: colors.borderStrong, backgroundColor: '#FAFBFC' },

  categoryCard: {
    flex: 1,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  rowHover: { backgroundColor: '#FAFBFC' },
  stockColumn: { alignItems: 'flex-end', gap: 2 },

  stat: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statSelected: { borderColor: colors.ink, borderWidth: 2, padding: spacing.md - 1 },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 8, height: 8, borderRadius: radius.full },
});
