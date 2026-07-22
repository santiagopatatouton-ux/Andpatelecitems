import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor ingresá tu email y contraseña.');
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // AuthContext will handle the redirect
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Auto-create the initial admin account if it fails and it's the exact admin email/pass
      if (
        (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') && 
        email.trim().toLowerCase() === 'sebastianpatat@hotmail.com' && 
        password === '20092013'
      ) {
        try {
          // Attempt to create the master admin account
          await createUserWithEmailAndPassword(auth, email.trim(), password);
          return; // Success, AuthContext takes over
        } catch (createError: any) {
          console.error('Create admin error:', createError);
          if (createError.code === 'auth/operation-not-allowed') {
            Alert.alert('Error de Configuración', 'Debes habilitar la autenticación por "Email y Contraseña" en la consola de Firebase -> Authentication -> Sign-in method.');
          } else {
            Alert.alert('Error', 'No se pudo crear la cuenta de administrador principal: ' + createError.message);
          }
          setLoading(false);
          return;
        }
      }

      let msg = 'Ocurrió un error al iniciar sesión: ' + error.message;
      if (error.code === 'auth/invalid-email') {
        msg = 'El formato del email no es válido.';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        msg = 'Email o contraseña incorrectos.';
      } else if (error.code === 'auth/user-disabled') {
        msg = 'Esta cuenta ha sido deshabilitada.';
      } else if (error.code === 'auth/operation-not-allowed') {
        msg = 'La autenticación por correo no está habilitada en Firebase.';
      }
      
      Alert.alert('Acceso Denegado', msg);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>⚡</Text>
            <Text style={styles.title}>Andpatelec</Text>
            <Text style={styles.subtitle}>Gestión de Materiales</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Iniciar Sesión</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="ejemplo@andpatelec.com"
                placeholderTextColor="#484f58"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#484f58"
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Ingresar</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            Acceso restringido a personal de Andpatelec.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoIcon: {
    fontSize: 64,
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#f0f6fc',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#8b949e',
  },
  formCard: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f0f6fc',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#c9d1d9',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0d1117',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  loginBtn: {
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    color: '#484f58',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 13,
  },
});
