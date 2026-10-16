/**
 * One-time script to seed initial users into Firebase Auth + Firestore.
 * Run this once from a page or console to create the 5 initial users.
 * 
 * Usage: Import and call seedUsersOnce() from any component or console.
 */
import { seedUsers } from '../utils/seed-users';

export async function seedUsersOnce() {
  try {
    console.log('Starting user seed...');
    const result = await seedUsers();
    if (result) {
      console.log('✅ Users seeded successfully! You can now sign in.');
    } else {
      console.log('Users already exist, no seed needed.');
    }
  } catch (error) {
    console.error('Failed to seed users:', error);
  }
}
