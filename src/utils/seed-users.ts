import { createUserWithEmailAndPassword } from 'firebase/auth';
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
 * Only runs if no users exist in the Firestore 'users' collection.
 * 
 * IMPORTANT: This function creates users via Firebase Auth client SDK,
 * which means it will sign in as each new user during creation.
 * After seeding, you'll need to sign in as the desired user.
 */
export async function seedUsers(): Promise<boolean> {
  try {
    console.log('Seeding initial users...');

    for (const userData of INITIAL_USERS) {
      try {
        // Create user in Firebase Auth
        const credential = await createUserWithEmailAndPassword(
          auth,
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

    console.log('✅ User seeding complete!');
    return true;
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
}

export { INITIAL_USERS };
