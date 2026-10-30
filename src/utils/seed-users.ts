import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as authSignOut } from 'firebase/auth';
import { doc, setDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

interface SeedUser {
  email: string;
  password: string;
  displayName: string;
  role: 'admin' | 'employee';
}

const INITIAL_USERS: SeedUser[] = [
  {
    email: 'sebastian.patat@andpatelec.com',
    password: 'andpatelec123',
    displayName: 'Sebastian Patat',
    role: 'admin',
  },
  {
    email: 'carlos.andelique@andpatelec.com',
    password: 'andpatelec123',
    displayName: 'Carlos Andelique',
    role: 'admin',
  },
  {
    email: 'dante.andelique@andpatelec.com',
    password: 'andpatelec123',
    displayName: 'Dante Andelique',
    role: 'employee',
  },
  {
    email: 'camila.freire@andpatelec.com',
    password: 'andpatelec123',
    displayName: 'Camila Freire',
    role: 'employee',
  },
  {
    email: 'pablo.cirillo@andpatelec.com',
    password: 'andpatelec123',
    displayName: 'Pablo Cirillo',
    role: 'employee',
  },
];

/**
 * Seeds the initial users into Firebase Auth and Firestore.
 * Only runs if no users exist in the Firestore 'users' collection (unless force is true).
 */
export async function seedUsers(force: boolean = false): Promise<boolean> {
  try {
    if (!force) {
      const existingUsersSnap = await getDocs(collection(db, 'users'));
      if (!existingUsersSnap.empty) {
        return true;
      }
    }

    console.log('Seeding initial users...');
    const secondaryAppName = 'SeedAuthApp';
    const secondaryApp =
      getApps().find((a) => a.name === secondaryAppName) ||
      initializeApp(auth.app.options, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    for (const userData of INITIAL_USERS) {
      try {
        // Create user in Firebase Auth using secondary app to avoid session disruption
        const credential = await createUserWithEmailAndPassword(
          secondaryAuth,
          userData.email,
          userData.password
        );

        // Save profile in Firestore
        await setDoc(doc(db, 'users', credential.user.uid), {
          displayName: userData.displayName,
          email: userData.email,
          role: userData.role,
          createdAt: serverTimestamp(),
          createdBy: 'system',
        });

        console.log(`✅ Created user: ${userData.displayName} (${userData.role})`);
      } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
          console.log(`User ${userData.email} already exists in Auth, skipping.`);
        } else {
          console.error(`Error creating user ${userData.email}:`, error);
        }
      }
    }

    await authSignOut(secondaryAuth);
    console.log('✅ User seeding complete!');
    return true;
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
}

export { INITIAL_USERS };
