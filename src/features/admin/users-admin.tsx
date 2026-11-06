import { collection, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useFeedback } from '@/components/ui/feedback';
import { KeyRound, Pencil, Shield, Trash2, User } from '@/components/ui/icons';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  Field,
  IconButton,
  Loading,
  SectionTitle,
  Segmented,
} from '@/components/ui/primitives';
import { useAuth, type UserProfile } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import {
  createUserAccount,
  deleteUserProfile,
  sendPasswordReset,
  updateUserName,
  updateUserRole,
  type Role,
} from '@/services/users';
import { colors, spacing } from '@/theme/tokens';
import { logAuditEvent } from '@/utils/audit-log';

const MIN_PASSWORD_LENGTH = 8;

const ROLE_OPTIONS: { value: Role; label: string; icon: typeof User }[] = [
  { value: 'employee', label: 'Empleado', icon: User },
  { value: 'admin', label: 'Administrador', icon: Shield },
];

const CREATE_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/invalid-email': 'El formato del email no es válido.',
  'auth/weak-password': 'La contraseña es demasiado débil.',
};

function UserRow({ user }: { user: UserProfile }) {
  const { userProfile } = useAuth();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  const isSelf = user.uid === userProfile?.uid;

  const audit = (action: 'edit_user' | 'change_role' | 'delete_user', details: string) =>
    logAuditEvent({
      action,
      adminId: userProfile?.uid ?? '',
      adminName: userProfile?.displayName ?? '',
      target: user.displayName,
      details,
    });

  const handleSave = async () => {
    const displayName = name.trim();
    if (!displayName) return;
    setSaving(true);
    try {
      await updateUserName(user.uid, displayName);
      await audit('edit_user', `Nombre: ${displayName}`);
      setEditing(false);
      toast('Nombre actualizado.');
    } catch (error) {
      console.error('Error updating user:', error);
      toast('No se pudo actualizar el usuario.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRole = async () => {
    const role: Role = user.role === 'admin' ? 'employee' : 'admin';
    const label = role === 'admin' ? 'administrador' : 'empleado';
    const accepted = await confirm({
      title: 'Cambiar rol',
      message: `¿Pasar a ${user.displayName} a ${label}?`,
      confirmLabel: 'Cambiar',
    });
    if (!accepted) return;
    try {
      await updateUserRole(user.uid, role);
      await audit('change_role', `${user.role} → ${role}`);
    } catch (error) {
      console.error('Error changing role:', error);
      toast('No se pudo cambiar el rol.', 'danger');
    }
  };

  const handleReset = async () => {
    const accepted = await confirm({
      title: 'Restablecer contraseña',
      message: `Se va a enviar un email a ${user.email} para elegir una contraseña nueva.`,
      confirmLabel: 'Enviar email',
    });
    if (!accepted) return;
    try {
      await sendPasswordReset(user.email);
      await audit('edit_user', 'Email de restablecimiento enviado');
      toast('Email enviado.');
    } catch (error) {
      console.error('Error sending reset:', error);
      toast('No se pudo enviar el email.', 'danger');
    }
  };

  const handleDelete = async () => {
    const accepted = await confirm({
      title: 'Eliminar usuario',
      message: `${user.displayName} ya no va a poder acceder a la app. Su historial se conserva.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!accepted) return;
    try {
      await deleteUserProfile(user.uid);
      await audit('delete_user', `Email: ${user.email}`);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast('No se pudo eliminar el usuario.', 'danger');
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {`${user.displayName}${isSelf ? ' (vos)' : ''}`}
          </AppText>
          <AppText variant="small" color={colors.textMuted} numberOfLines={1}>
            {user.email}
          </AppText>
        </View>
        <Badge
          label={user.role === 'admin' ? 'Admin' : 'Empleado'}
          tone={user.role === 'admin' ? 'info' : 'neutral'}
        />
      </View>

      {editing ? (
        <View style={styles.form}>
          <Field label="Nombre" value={name} onChangeText={setName} />
          <View style={styles.actions}>
            <Button label="Cancelar" variant="secondary" onPress={() => setEditing(false)} />
            <Button label="Guardar" loading={saving} onPress={handleSave} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <IconButton icon={Pencil} label={`Editar a ${user.displayName}`} onPress={() => setEditing(true)} />
          <IconButton
            icon={KeyRound}
            label={`Restablecer contraseña de ${user.displayName}`}
            onPress={handleReset}
          />
          {!isSelf && (
            <>
              <IconButton
                icon={Shield}
                label={user.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                onPress={handleToggleRole}
              />
              <IconButton
                icon={Trash2}
                label={`Eliminar a ${user.displayName}`}
                color={colors.danger}
                onPress={handleDelete}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

export function UsersAdmin() {
  const { userProfile } = useAuth();
  const { toast } = useFeedback();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const list = snapshot.docs.map((item) => ({ ...item.data(), uid: item.id }) as UserProfile);
          setUsers(list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es')));
          setLoading(false);
        },
        (failure) => {
          console.error('Error loading users:', failure);
          toast('No se pudieron cargar los usuarios.', 'danger');
          setLoading(false);
        }
      ),
    [toast]
  );

  const handleCreate = async () => {
    if (!displayName.trim() || !email.trim()) return setError('Completá nombre y email.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    setError('');
    setCreating(true);
    try {
      await createUserAccount(
        { displayName: displayName.trim(), email: email.trim(), password, role },
        userProfile?.uid ?? ''
      );
      await logAuditEvent({
        action: 'create_user',
        adminId: userProfile?.uid ?? '',
        adminName: userProfile?.displayName ?? '',
        target: displayName.trim(),
        details: `Email: ${email.trim()}, rol: ${role}`,
      });
      toast(`Usuario ${displayName.trim()} creado.`);
      setDisplayName('');
      setEmail('');
      setPassword('');
      setRole('employee');
    } catch (failure) {
      console.error('Error creating user:', failure);
      const code = (failure as { code?: string }).code ?? '';
      setError(CREATE_ERRORS[code] ?? 'No se pudo crear el usuario.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <Loading label="Cargando usuarios" />;

  return (
    <>
      <SectionTitle title="Usuarios" hint={`${users.length} con acceso`} />
      <Card style={styles.list}>
        {users.map((user, index) => (
          <View key={user.uid}>
            {index > 0 && <Divider />}
            <UserRow user={user} />
          </View>
        ))}
      </Card>

      <Card style={styles.form}>
        <SectionTitle title="Nuevo usuario" />
        <Field label="Nombre completo" value={displayName} onChangeText={setDisplayName} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="Contraseña inicial"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres. La persona la puede cambiar desde Mi cuenta.`}
          error={error}
        />
        <Segmented options={ROLE_OPTIONS} value={role} onChange={setRole} />
        <View style={styles.actions}>
          <Button label="Crear usuario" loading={creating} onPress={handleCreate} />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { padding: 0, overflow: 'hidden' },
  row: { gap: spacing.sm, padding: spacing.lg },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  form: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
});
