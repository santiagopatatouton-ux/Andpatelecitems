import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { auth, db, getSecondaryAuth } from '@/lib/firebase';

export type Role = 'admin' | 'employee';

export interface NewUser {
  displayName: string;
  email: string;
  password: string;
  role: Role;
}

/** Crea la cuenta y el perfil. Las reglas de Firestore solo dejan a un admin crear el perfil. */
export async function createUserAccount(user: NewUser, createdBy: string) {
  const secondaryAuth = getSecondaryAuth();
  const credential = await createUserWithEmailAndPassword(secondaryAuth, user.email, user.password);
  await signOut(secondaryAuth);

  await setDoc(doc(db, 'users', credential.user.uid), {
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    createdAt: serverTimestamp(),
    createdBy,
  });
}

export const updateUserName = (uid: string, displayName: string) =>
  updateDoc(doc(db, 'users', uid), { displayName });

export const updateUserRole = (uid: string, role: Role) =>
  updateDoc(doc(db, 'users', uid), { role });

/** Sin perfil la cuenta pierde todo el acceso, aunque siga existiendo en Authentication. */
export const deleteUserProfile = (uid: string) => deleteDoc(doc(db, 'users', uid));

export const sendPasswordReset = (email: string) => sendPasswordResetEmail(auth, email);
