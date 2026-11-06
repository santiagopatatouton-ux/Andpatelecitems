import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const { connectAuthEmulator, getAuth, initializeAuth } = FirebaseAuth;

// Con EXPO_PUBLIC_USE_EMULATORS=1 la app usa los emuladores locales y un proyecto
// "demo-", que no puede tocar los datos reales. Ver README.
export const usingEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS === '1';

const AUTH_EMULATOR_URL = 'http://127.0.0.1:9399';
const FIRESTORE_EMULATOR_PORT = 8085;

const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyC_i-7uv-oDBem62tzUBemFLLM09UJmH1Q',
  authDomain: 'andpatelecitems.firebaseapp.com',
  projectId: usingEmulators ? 'demo-andpatelec' : 'andpatelecitems',
  storageBucket: 'andpatelecitems.firebasestorage.app',
  messagingSenderId: '654849034296',
  appId: '1:654849034296:web:b6fc7c66c8b71d00107ecd',
  measurementId: 'G-QBNYHCMY0F',
};

const app = initializeApp(firebaseConfig);

function createAuth() {
  if (Platform.OS === 'web') return getAuth(app);
  // getReactNativePersistence solo existe en el build nativo de firebase/auth.
  const { getReactNativePersistence } = FirebaseAuth as unknown as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
  };
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}

export const auth = createAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);

if (usingEmulators) {
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', FIRESTORE_EMULATOR_PORT);
}

/**
 * Auth paralelo para crear cuentas sin cerrar la sesión del admin:
 * createUserWithEmailAndPassword inicia sesión con la cuenta nueva.
 */
export function getSecondaryAuth() {
  const name = 'account-creation';
  const existing = getApps().find((candidate) => candidate.name === name);
  if (existing) return getAuth(existing);

  const secondaryAuth = getAuth(initializeApp(firebaseConfig, name));
  if (usingEmulators) {
    connectAuthEmulator(secondaryAuth, AUTH_EMULATOR_URL, { disableWarnings: true });
  }
  return secondaryAuth;
}
