import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, useIsWide } from '@/components/layout/app-shell';
import { CircleAlert, Eye, EyeOff, Mail, KeyRound } from '@/components/ui/icons';
import { AppText, Banner, Button, Field, IconButton } from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { colors, spacing } from '@/theme/tokens';

const AUTH_ERRORS: Record<string, string> = {
  'auth/user-not-found': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/invalid-email': 'El formato del email no es válido.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá un momento y volvé a probar.',
  'auth/network-request-failed': 'Sin conexión a internet.',
};

export default function LoginScreen() {
  const { signIn } = useAuth();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Completá email y contraseña.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (failure) {
      const code = (failure as { code?: string }).code ?? '';
      setError(AUTH_ERRORS[code] ?? 'No se pudo iniciar sesión. Intentá de nuevo.');
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      {wide && (
        <View style={styles.aside}>
          <View style={styles.asideBrand}>
            <BrandMark size={40} />
            <AppText variant="title" color={colors.onInk}>
              Andpatelec
            </AppText>
          </View>
          <View style={styles.asideCopy}>
            <AppText variant="display" color={colors.onInk}>
              Control de stock
            </AppText>
            <AppText color={colors.onInkMuted}>
              Materiales, pedidos y movimientos del depósito y las obras, en un solo lugar.
            </AppText>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.form}>
            {!wide && (
              <View style={styles.mobileBrand}>
                <BrandMark size={48} />
                <AppText variant="title">Andpatelec</AppText>
              </View>
            )}

            <View>
              <AppText variant={wide ? 'display' : 'title'} accessibilityRole="header">
                Iniciar sesión
              </AppText>
              <AppText color={colors.textMuted}>Ingresá con tu cuenta de la empresa.</AppText>
            </View>

            {error ? (
              <Banner tone="danger" icon={CircleAlert}>
                {error}
              </Banner>
            ) : null}

            <Field
              label="Email"
              leading={Mail}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
              }}
              placeholder="nombre@andpatelec.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!loading}
            />

            <Field
              label="Contraseña"
              leading={KeyRound}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError('');
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!loading}
              onSubmitEditing={handleLogin}
              trailing={
                <IconButton
                  icon={showPassword ? EyeOff : Eye}
                  label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  color={colors.textMuted}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />

            <Button label="Ingresar" size="lg" onPress={handleLogin} loading={loading} fullWidth />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  aside: {
    width: '42%',
    maxWidth: 520,
    backgroundColor: colors.ink,
    padding: spacing.xxxl,
    justifyContent: 'space-between',
  },
  asideBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  asideCopy: { gap: spacing.sm, maxWidth: 380 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  form: { width: '100%', maxWidth: 400, gap: spacing.lg },
  mobileBrand: { alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
});
