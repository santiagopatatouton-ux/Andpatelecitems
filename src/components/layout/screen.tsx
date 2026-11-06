import { useRouter } from 'expo-router';
import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, useIsWide } from './app-shell';
import { ArrowLeft } from '@/components/ui/icons';
import { AppText, IconButton } from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { colors, layout, radius, spacing } from '@/theme/tokens';
import { initials } from '@/utils/format';

/** Marco del contenido: gutter según el ancho y columna centrada en escritorio. */
export function useContentFrame(): ViewStyle {
  const wide = useIsWide();
  return {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: wide ? spacing.xxl : spacing.lg,
  };
}

function AccountButton() {
  const router = useRouter();
  const { userProfile } = useAuth();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Mi cuenta"
      onPress={() => router.push('/account' as never)}
      style={styles.account}
      hitSlop={6}
    >
      <AppText variant="smallStrong" color={colors.onInk}>
        {initials(userProfile?.displayName ?? '')}
      </AppText>
    </Pressable>
  );
}

interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Ruta a la que vuelve si no hay historial, por ejemplo tras recargar en web. */
  backTo?: string;
  actions?: ReactNode;
  /** false cuando la pantalla usa su propia lista virtualizada. */
  scroll?: boolean;
  children: ReactNode;
}

export function Screen({ title, subtitle, backTo, actions, scroll = true, children }: ScreenProps) {
  const router = useRouter();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const frame = useContentFrame();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (backTo) router.replace(backTo as never);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={[styles.header, { paddingTop: insets.top + (wide ? spacing.xl : spacing.md) }]}>
        <View style={[frame, styles.headerRow]}>
          {backTo ? (
            <IconButton icon={ArrowLeft} label="Volver" onPress={goBack} style={styles.back} />
          ) : (
            !wide && <BrandMark size={32} />
          )}
          <View style={styles.flex}>
            <AppText variant={wide ? 'display' : 'title'} numberOfLines={1} accessibilityRole="header">
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {actions}
          {!wide && !backTo && <AccountButton />}
        </View>
      </View>

      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[frame, styles.scrollContent]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: { paddingBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: { marginLeft: -spacing.sm },
  scrollContent: { gap: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  account: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
