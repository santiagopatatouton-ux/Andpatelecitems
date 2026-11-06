import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useIsWide } from '@/components/layout/app-shell';
import { Screen } from '@/components/layout/screen';
import { useFeedback } from '@/components/ui/feedback';
import { LogOut, Settings } from '@/components/ui/icons';
import { AppText, Badge, Button, Card, Field, SectionTitle } from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { colors, spacing } from '@/theme/tokens';

const MIN_PASSWORD_LENGTH = 8;

export default function AccountScreen() {
  const router = useRouter();
  const { userProfile, isAdmin, changePassword, signOut } = useAuth();
  const { toast } = useFeedback();
  const wide = useIsWide();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (!current) return setError('Ingresá tu contraseña actual.');
    if (next.length < MIN_PASSWORD_LENGTH) {
      return setError(`La contraseña nueva necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
    if (next !== repeat) return setError('Las contraseñas nuevas no coinciden.');

    setError('');
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      toast('Contraseña actualizada.');
    } catch (failure) {
      const code = (failure as { code?: string }).code;
      const wrongPassword = code === 'auth/wrong-password' || code === 'auth/invalid-credential';
      setError(wrongPassword ? 'La contraseña actual no es correcta.' : 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Mi cuenta" backTo={wide ? undefined : '/'}>
      <Card style={styles.card}>
        <AppText variant="heading">{userProfile?.displayName}</AppText>
        <AppText color={colors.textMuted}>{userProfile?.email}</AppText>
        <Badge label={isAdmin ? 'Administrador' : 'Empleado'} tone={isAdmin ? 'info' : 'neutral'} />
      </Card>

      {isAdmin && !wide && (
        <Button
          label="Administración"
          variant="secondary"
          icon={Settings}
          onPress={() => router.push('/admin')}
          fullWidth
        />
      )}

      <Card style={styles.card}>
        <SectionTitle title="Cambiar contraseña" />
        <Field
          label="Contraseña actual"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoComplete="current-password"
        />
        <Field
          label="Contraseña nueva"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
        />
        <Field
          label="Repetir contraseña nueva"
          value={repeat}
          onChangeText={setRepeat}
          secureTextEntry
          autoComplete="new-password"
          error={error}
        />
        <View style={styles.actions}>
          <Button label="Guardar contraseña" loading={saving} onPress={handleChangePassword} />
        </View>
      </Card>

      {!wide && (
        <Button label="Cerrar sesión" variant="ghost" icon={LogOut} onPress={signOut} fullWidth />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
