import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: 'admin' | 'employee';
  createdAt?: any;
  createdBy?: string;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  createUser: (
    email: string,
    password: string,
    displayName: string,
    role: 'admin' | 'employee'
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  isAdmin: false,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  createUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Load user profile from Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUserProfile({
              uid: firebaseUser.uid,
              ...userDoc.data(),
            } as UserProfile);
          } else {
            // User exists in Auth but not in Firestore — shouldn't happen normally
            setUserProfile(null);
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  const createUser = async (
    email: string,
    password: string,
    displayName: string,
    role: 'admin' | 'employee'
  ) => {
    // Note: Creating users from the client side with Firebase Auth will sign in
    // as the new user. We need to handle this by saving current user and re-signing in.
    const currentUser = auth.currentUser;
    const currentEmail = currentUser?.email;

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const newUid = credential.user.uid;

      // Save user profile in Firestore
      await setDoc(doc(db, 'users', newUid), {
        displayName,
        email,
        role,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid || 'system',
      });

      // Firebase Auth automatically signs in as the new user.
      // We don't re-sign-in as the admin here because the caller
      // (admin panel) will handle that flow.
    } catch (error) {
      throw error;
    }
  };

  const isAdmin = userProfile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        isAdmin,
        loading,
        signIn,
        signOut,
        createUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
