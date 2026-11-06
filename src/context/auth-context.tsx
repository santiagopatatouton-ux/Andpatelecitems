import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth, db } from '@/lib/firebase';
import type { Role } from '@/services/users';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  /** Mientras es true todavía no se sabe si hay sesión o perfil. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requiere AuthProvider');
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopProfile: (() => void) | undefined;

    const stopAuth = onAuthStateChanged(auth, (firebaseUser) => {
      stopProfile?.();
      stopProfile = undefined;
      setUser(firebaseUser);

      if (!firebaseUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }

      // En vivo: si un admin cambia el rol o borra el perfil, aplica sin recargar.
      setLoading(true);
      stopProfile = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snapshot) => {
          setUserProfile(
            snapshot.exists()
              ? ({ ...snapshot.data(), uid: firebaseUser.uid } as UserProfile)
              : null
          );
          setLoading(false);
        },
        (error) => {
          console.error('Error loading user profile:', error);
          setUserProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userProfile,
      isAdmin: userProfile?.role === 'admin',
      loading,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      signOut: () => firebaseSignOut(auth),
      changePassword: async (currentPassword, newPassword) => {
        const current = auth.currentUser;
        if (!current?.email) throw new Error('No hay sesión activa.');
        const credential = EmailAuthProvider.credential(current.email, currentPassword);
        await reauthenticateWithCredential(current, credential);
        await updatePassword(current, newPassword);
      },
    }),
    [user, userProfile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
