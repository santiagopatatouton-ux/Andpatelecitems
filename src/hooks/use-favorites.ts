import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { toMillis } from '@/utils/format';

export interface Favorite {
  id: string;
  path: string[];
  name: string;
  addedAt: never;
}

export function useFavorites() {
  const { userProfile } = useAuth();
  const uid = userProfile?.uid;
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'users', uid, 'favorites'),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Favorite);
        next.sort((a, b) => toMillis(b.addedAt) - toMillis(a.addedAt));
        setFavorites(next);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading favorites:', error);
        setLoading(false);
      }
    );
  }, [uid]);

  const addFavorite = useCallback(
    async (path: string[]) => {
      if (!uid) return;
      await addDoc(collection(db, 'users', uid, 'favorites'), {
        path,
        name: path[path.length - 1],
        addedAt: serverTimestamp(),
      });
    },
    [uid]
  );

  const removeFavorite = useCallback(
    async (id: string) => {
      if (!uid) return;
      await deleteDoc(doc(db, 'users', uid, 'favorites', id));
    },
    [uid]
  );

  return { favorites, loading, addFavorite, removeFavorite };
}
