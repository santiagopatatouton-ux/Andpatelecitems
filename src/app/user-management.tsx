import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, getDocs, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../../firebaseConfig';
import { useRouter } from 'expo-router';
import { useAuth, UserProfile } from '../utils/auth-context';

interface UserData extends UserProfile {
  id: string;
}

export default function UserManagementScreen() {
  const { userProfile, isAdmin, user: currentUser } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newCanEdit, setNewCanEdit] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) {
      Alert.alert('Acceso Denegado', 'Solo el administrador principal puede gestionar usuarios.');
      if (router.canGoBack()) router.back(); else router.replace('/');
    } else {
      loadUsers();
    }
  }, [isAdmin]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const usersData: UserData[] = [];
      
      snapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() } as UserData);
      });
      
      // Sort by email
      usersData.sort((a, b) => a.email.localeCompare(b.email));
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newDisplayName) {
      Alert.alert('Campos incompletos', 'Completá todos los campos para crear el usuario.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      setCreating(true);
      
      // Store current admin credentials temporarily to re-login if needed
      // Actually, creating a user logs the admin out. To avoid that, we can use a second Firebase App, 
      // or just re-authenticate if we had the admin's password (which we don't store).
      // Since this is a simple implementation and we don't want to use Cloud Functions,
      // we'll use the trick of creating the user, saving their profile, and telling the admin they need to log in again.
      
      Alert.alert(
        'Atención', 
        'Por seguridad de Firebase, crear un nuevo usuario cerrará tu sesión actual de administrador. ¿Querés continuar?',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setCreating(false) },
          { 
            text: 'Crear usuario', 
            onPress: async () => {
              try {
                // 1. Create user in Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, newEmail.trim(), newPassword);
                const newUserId = userCredential.user.uid;
                
                // 2. Save profile in Firestore
                const newUserProfile: UserProfile = {
                  email: newEmail.trim(),
                  displayName: newDisplayName.trim(),
                  role: 'user',
                  canEditCatalog: newCanEdit,
                  disabled: false,
                };
                
                await setDoc(doc(db, 'users', newUserId), {
                  ...newUserProfile,
                  createdAt: serverTimestamp()
                });
                
                Alert.alert('Éxito', `Usuario ${newEmail} creado correctamente. Por favor iniciá sesión nuevamente.`);
                
                // The onAuthStateChanged listener in AuthContext will handle the redirect to login
              } catch (err: any) {
                setCreating(false);
                let msg = 'No se pudo crear el usuario.';
                if (err.code === 'auth/email-already-in-use') msg = 'El email ya está en uso.';
                else if (err.code === 'auth/invalid-email') msg = 'Email inválido.';
                Alert.alert('Error', msg);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error in handleCreateUser:', error);
      setCreating(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean, email: string) => {
    if (email.toLowerCase() === 'sebastianpatat@hotmail.com') {
      Alert.alert('Error', 'No se puede deshabilitar al administrador principal.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        disabled: !currentStatus
      });
      loadUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      Alert.alert('Error', 'No se pudo actualizar el usuario.');
    }
  };

  const toggleEditPermission = async (userId: string, currentPermission: boolean, email: string) => {
    if (email.toLowerCase() === 'sebastianpatat@hotmail.com') {
      Alert.alert('Error', 'El administrador principal siempre puede editar el catálogo.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        canEditCatalog: !currentPermission
      });
      loadUsers();
    } catch (error) {
      console.error('Error updating permissions:', error);
      Alert.alert('Error', 'No se pudieron actualizar los permisos.');
    }
  };

  const renderUserItem = ({ item }: { item: UserData }) => {
    const isMainAdmin = item.email.toLowerCase() === 'sebastianpatat@hotmail.com';
    const isSelf = currentUser?.email === item.email;

    return (
      <View style={[styles.userCard, item.disabled && styles.userCardDisabled]}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.displayName || 'Sin nombre'}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          
          <View style={styles.badgesContainer}>
            <View style={[styles.badge, item.role === 'admin' ? styles.badgeAdmin : styles.badgeUser]}>
              <Text style={styles.badgeText}>{item.role === 'admin' ? 'Admin' : 'Usuario'}</Text>
            </View>
            {item.disabled && (
              <View style={[styles.badge, styles.badgeDisabled]}>
                <Text style={styles.badgeText}>Inactivo</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.userControls}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Editar Catálogo</Text>
            <Switch
              value={item.canEditCatalog}
              onValueChange={() => toggleEditPermission(item.id, item.canEditCatalog, item.email)}
              disabled={isMainAdmin}
              trackColor={{ false: '#30363d', true: '#238636' }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#f0f6fc'}
            />
          </View>
          
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Cuenta Activa</Text>
            <Switch
              value={!item.disabled}
              onValueChange={() => toggleUserStatus(item.id, !!item.disabled, item.email)}
              disabled={isMainAdmin || isSelf}
              trackColor={{ false: '#f85149', true: '#238636' }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#f0f6fc'}
            />
          </View>
        </View>
      </View>
    );
  };

  if (!isAdmin) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestión de Usuarios</Text>
        <View style={{ width: 70 }} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadUsers();
          }}
          ListHeaderComponent={
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Crear Nuevo Usuario</Text>
              <Text style={styles.sectionSubtitle}>
                El nuevo usuario podrá acceder con email y contraseña.
              </Text>
              
              <TextInput
                style={styles.input}
                value={newDisplayName}
                onChangeText={setNewDisplayName}
                placeholder="Nombre completo"
                placeholderTextColor="#8b949e"
              />
              <TextInput
                style={styles.input}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="Email corporativo"
                placeholderTextColor="#8b949e"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Contraseña temporal (mín. 6 chars)"
                placeholderTextColor="#8b949e"
                secureTextEntry
              />
              
              <View style={styles.switchRowForm}>
                <Text style={styles.switchLabelForm}>¿Puede editar el catálogo?</Text>
                <Switch
                  value={newCanEdit}
                  onValueChange={setNewCanEdit}
                  trackColor={{ false: '#30363d', true: '#238636' }}
                  thumbColor={Platform.OS === 'ios' ? undefined : '#f0f6fc'}
                />
              </View>

              <TouchableOpacity
                style={[styles.createBtn, creating && styles.btnDisabled]}
                onPress={handleCreateUser}
                disabled={creating}
                activeOpacity={0.8}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>Crear y Notificar</Text>
                )}
              </TouchableOpacity>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    backgroundColor: '#161b22',
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: '#58a6ff',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  
  // Add Section
  addSection: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#8b949e',
    fontSize: 13,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0d1117',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  switchRowForm: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  switchLabelForm: {
    color: '#c9d1d9',
    fontSize: 15,
    fontWeight: '500',
  },
  createBtn: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // User Cards
  userCard: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userCardDisabled: {
    opacity: 0.6,
  },
  userInfo: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    paddingBottom: 12,
  },
  userName: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userEmail: {
    color: '#8b949e',
    fontSize: 14,
    marginTop: 2,
  },
  badgesContainer: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeAdmin: {
    backgroundColor: '#1f3a5f',
  },
  badgeUser: {
    backgroundColor: '#21262d',
  },
  badgeDisabled: {
    backgroundColor: '#4a151b',
  },
  badgeText: {
    color: '#c9d1d9',
    fontSize: 11,
    fontWeight: '600',
  },
  userControls: {
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: '#c9d1d9',
    fontSize: 14,
  }
});
