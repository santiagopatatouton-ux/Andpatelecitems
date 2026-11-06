import React, { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { Minus, Plus, type IconComponent } from './icons';
import {
  colors,
  iconSize,
  iconStroke,
  layout,
  radius,
  spacing,
  toneColors,
  typography,
  type Tone,
  type TypographyVariant,
} from '@/theme/tokens';
import { parseNumber, roundQuantity } from '@/utils/format';

// react-native-web agrega `hovered` al estado de Pressable.
type InteractionState = PressableStateCallbackType & { hovered?: boolean };

// ---------- Texto ----------

interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  /** Números de ancho fijo, para que las columnas de cantidades queden alineadas. */
  tabular?: boolean;
}

export function AppText({ variant = 'body', color = colors.text, tabular, style, ...props }: AppTextProps) {
  return (
    <Text
      {...props}
      style={[typography[variant], { color }, tabular && styles.tabular, style]}
    />
  );
}

// ---------- Botones ----------

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, { bg: string; hover: string; fg: string; border?: string }> = {
  primary: { bg: colors.ink, hover: colors.inkRaised, fg: colors.onInk },
  accent: { bg: colors.brand, hover: '#F2BC00', fg: colors.onBrand },
  secondary: { bg: colors.surface, hover: colors.surfaceSunken, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', hover: colors.surfaceSunken, fg: colors.text },
  danger: { bg: colors.danger, hover: '#A31D1D', fg: '#FFFFFF' },
};

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconComponent;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  fullWidth,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const palette = BUTTON_STYLES[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      {...props}
      style={(state) => {
        const { pressed, hovered } = state as InteractionState;
        return [
          styles.button,
          size === 'lg' && styles.buttonLarge,
          {
            backgroundColor: pressed || hovered ? palette.hover : palette.bg,
            borderColor: palette.border ?? 'transparent',
          },
          fullWidth && styles.fullWidth,
          inactive && styles.disabled,
          style,
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {Icon && <Icon size={iconSize.md} color={palette.fg} strokeWidth={iconStroke} />}
          <AppText variant="bodyStrong" color={palette.fg} numberOfLines={1}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  icon: IconComponent;
  label: string;
  color?: string;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon: Icon, label, color = colors.text, filled, disabled, style, ...props }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...props}
      style={(state) => {
        const { pressed, hovered } = state as InteractionState;
        return [
          styles.iconButton,
          (pressed || hovered) && styles.iconButtonActive,
          disabled && styles.disabled,
          style,
        ];
      }}
    >
      <Icon
        size={iconSize.md}
        color={color}
        strokeWidth={iconStroke}
        fill={filled ? color : 'none'}
      />
    </Pressable>
  );
}

// ---------- Contenedores ----------

export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]} />;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const palette = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <AppText variant="caption" color={palette.fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function Banner({
  tone = 'info',
  icon: Icon,
  children,
}: {
  tone?: Tone;
  icon: IconComponent;
  children: ReactNode;
}) {
  const palette = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Icon size={iconSize.md} color={palette.fg} strokeWidth={iconStroke} />
      <AppText variant="small" color={palette.fg} style={styles.flex}>
        {children}
      </AppText>
    </View>
  );
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.flex}>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {hint ? (
          <AppText variant="small" color={colors.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// ---------- Selección ----------

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconComponent;
}) {
  const fg = selected ? colors.onInk : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={(state) => {
        const { pressed, hovered } = state as InteractionState;
        return [
          styles.chip,
          selected && styles.chipSelected,
          !selected && (pressed || hovered) && styles.chipHover,
        ];
      }}
    >
      {Icon && <Icon size={iconSize.sm} color={fg} strokeWidth={iconStroke} />}
      <AppText variant="smallStrong" color={fg} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconComponent }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map(({ value: option, label, icon: Icon }) => {
        const selected = option === value;
        const fg = selected ? colors.text : colors.textMuted;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            {Icon && <Icon size={iconSize.sm} color={fg} strokeWidth={iconStroke} />}
            <AppText variant="smallStrong" color={fg} numberOfLines={1}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Formularios ----------

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
  leading?: IconComponent;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function Field({
  label,
  hint,
  error,
  leading: Leading,
  trailing,
  containerStyle,
  inputStyle,
  multiline,
  onFocus,
  onBlur,
  ...props
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, containerStyle]}>
      <AppText variant="smallStrong" color={colors.text}>
        {label}
      </AppText>
      <View
        style={[
          styles.inputBox,
          multiline && styles.inputBoxMultiline,
          focused && styles.inputBoxFocused,
          !!error && styles.inputBoxError,
        ]}
      >
        {Leading && <Leading size={iconSize.md} color={colors.textMuted} strokeWidth={iconStroke} />}
        <TextInput
          {...props}
          accessibilityLabel={label}
          multiline={multiline}
          placeholderTextColor={colors.placeholder}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, multiline && styles.inputMultiline, inputStyle]}
        />
        {trailing}
      </View>
      {error ? (
        <AppText variant="small" color={colors.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Texto de cantidad: enteros, o con decimales para unidades como metros. */
export function sanitizeQuantity(text: string, decimal: boolean): string {
  if (!decimal) return text.replace(/\D/g, '');
  const cleaned = text.replace(/[^\d.,]/g, '').replace('.', ',');
  const [whole, ...rest] = cleaned.split(',');
  return rest.length ? `${whole},${rest.join('').slice(0, 3)}` : whole;
}

export function QuantityStepper({
  value,
  onChange,
  decimal = false,
  label = 'Cantidad',
  compact,
}: {
  value: string;
  onChange: (value: string) => void;
  decimal?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const step = (delta: number) => {
    const next = Math.max(1, roundQuantity((parseNumber(value) ?? 0) + delta));
    onChange(String(next).replace('.', ','));
  };

  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      <IconButton icon={Minus} label={`Restar a ${label.toLowerCase()}`} onPress={() => step(-1)} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(sanitizeQuantity(text, decimal))}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        style={[styles.stepperInput, compact && styles.stepperInputCompact]}
      />
      <IconButton icon={Plus} label={`Sumar a ${label.toLowerCase()}`} onPress={() => step(1)} />
    </View>
  );
}

// ---------- Estados ----------

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: IconComponent;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon size={iconSize.lg} color={colors.textMuted} strokeWidth={iconStroke} />
      </View>
      <AppText variant="heading" style={styles.centered}>
        {title}
      </AppText>
      {message ? (
        <AppText color={colors.textMuted} style={[styles.centered, styles.emptyMessage]}>
          {message}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.empty} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.ink} />
      <AppText color={colors.textMuted}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  centered: { textAlign: 'center' },

  button: {
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonLarge: { minHeight: 52, paddingHorizontal: spacing.xl },
  iconButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: { backgroundColor: colors.surfaceSunken },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  divider: { height: 1, backgroundColor: colors.border },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipHover: { backgroundColor: colors.surfaceSunken },

  segmented: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  field: { gap: 6 },
  inputBox: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inputBoxMultiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  inputBoxFocused: { borderColor: colors.ink },
  inputBoxError: { borderColor: colors.danger },
  input: {
    ...typography.body,
    flex: 1,
    minWidth: 0,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  stepperCompact: { alignSelf: 'flex-start' },
  stepperInput: {
    ...typography.title,
    textAlign: 'center',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 46,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  stepperInputCompact: { ...typography.bodyStrong, flexGrow: 0, flexBasis: 64 },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyMessage: { maxWidth: 380 },
});
