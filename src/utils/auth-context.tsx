import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { useRouter, useSegments } from 'expo-router';

export interface UserProfile {
  email: string;
  displayName?: string;
  role: 'admin' | 'user';
  canEditCatalog: boolean;
  disabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  signOut: async () => {},
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch or create user profile
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const profile = docSnap.data() as UserProfile;
            if (profile.disabled) {
              await firebaseSignOut(auth);
              setUser(null);
              setUserProfile(null);
            } else {
              setUserProfile(profile);
            }
          } else {
            // First time login for the admin or dynamically created user
            const isMainAdmin = currentUser.email?.toLowerCase() === 'sebastianpatat@hotmail.com';
            const newProfile: UserProfile = {
              email: currentUser.email || '',
              role: isMainAdmin ? 'admin' : 'user',
              canEditCatalog: isMainAdmin ? true : false,
              disabled: false,
            };
            await setDoc(docRef, { ...newProfile, createdAt: serverTimestamp() });
            setUserProfile(newProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Protect routes based on auth state
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';
    
    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // Redirect away from login if authenticated
      router.replace('/');
    }
  }, [user, loading, segments]);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const isAdmin = userProfile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signOut, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}
