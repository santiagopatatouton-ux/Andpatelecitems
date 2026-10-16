import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth-context';
import { seedUsers, INITIAL_USERS } from '../utils/seed-users';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState('');

  // Auto seed initial users on mount so Firebase Auth accounts are created
  useEffect(() => {
    seedUsers().catch((err) => console.log('Auto-seed check:', err));
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Completá email y contraseña.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      console.error('Login error:', err);
      let message = 'Error al iniciar sesión.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = 'Email o contraseña incorrectos. Si es la primera vez, presioná "Crear usuarios iniciales" abajo.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'El formato del email no es válido.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Demasiados intentos. Esperá un momento.';
      } else if (err.code === 'auth/network-request-failed') {
        message = 'Sin conexión a internet.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuickUser = (u: typeof INITIAL_USERS[0]) => {
    setEmail(u.email);
    setPassword(u.password);
    setError('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Brand */}
          <View style={styles.brandSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>⚡</Text>
            </View>
            <Text style={styles.brandName}>Andpatelec</Text>
            <Text style={styles.brandTagline}>Gestión de Materiales</Text>
          </View>

          {/* Login Card */}
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Iniciar sesión</Text>
            <Text style={styles.loginSubtitle}>
              Ingresá con tu cuenta o seleccioná un usuario abajo
            </Text>

            {/* Error message */}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
              }}
              placeholder="nombre@andpatelec.com"
              placeholderTextColor="#484f58"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            {/* Password */}
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                placeholder="••••••••"
                placeholderTextColor="#484f58"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Text style={styles.eyeIcon}>
                  {showPassword ? '🙈' : '👁️'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Ingresar</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Quick Select Users */}
          <View style={styles.quickUsersSection}>
            <Text style={styles.quickUsersTitle}>⚡ Acceso rápido por usuario:</Text>
            <View style={styles.quickUsersGrid}>
              {INITIAL_USERS.map((u) => (
                <TouchableOpacity
                  key={u.email}
                  style={styles.quickUserChip}
                  onPress={() => handleSelectQuickUser(u)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickUserText}>
                    {u.role === 'admin' ? '👑' : '👤'} {u.displayName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.seedBtn}
              onPress={async () => {
                setSeeding(true);
                try {
                  await seedUsers();
                  const msg = '✅ Usuarios iniciales verificados/creados correctamente en Firebase.';
                  if (Platform.OS === 'web') window.alert(msg);
                  else Alert.alert('Éxito', msg);
                } catch (e: any) {
                  const msg = 'Error al crear usuarios: ' + (e.message || e);
                  if (Platform.OS === 'web') window.alert(msg);
                  else Alert.alert('Error', msg);
                } finally {
                  setSeeding(false);
                }
              }}
              disabled={seeding}
            >
              {seeding ? (
                <ActivityIndicator color="#58a6ff" size="small" />
              ) : (
                <Text style={styles.seedBtnText}>🔄 Crear/Restablecer usuarios iniciales</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Andpatelec · Control de Stock
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },

  // Brand
  brandSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#161b22',
    borderWidth: 2,
    borderColor: '#1f6feb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#1f6feb',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  logoIcon: {
    fontSize: 42,
  },
  brandName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#f0f6fc',
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: 14,
    color: '#8b949e',
    marginTop: 4,
  },

  // Login card
  loginCard: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f0f6fc',
    marginBottom: 4,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#8b949e',
    marginBottom: 20,
  },

  // Error
  errorBox: {
    backgroundColor: '#2d1215',
    borderColor: '#f85149',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#f85149',
    fontSize: 13,
    fontWeight: '500',
  },

  // Form
  label: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0d1117',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 10,
    padding: 4,
  },
  eyeIcon: {
    fontSize: 20,
  },

  // Button
  loginBtn: {
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Quick select
  quickUsersSection: {
    marginTop: 24,
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  quickUsersTitle: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  quickUsersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  quickUserChip: {
    backgroundColor: '#0d1117',
    borderColor: '#1f6feb40',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickUserText: {
    color: '#58a6ff',
    fontSize: 12,
    fontWeight: '600',
  },
  seedBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  seedBtnText: {
    color: '#8b949e',
    fontSize: 12,
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    color: '#484f58',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
});
