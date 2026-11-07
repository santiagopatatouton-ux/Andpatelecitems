import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { compareNames } from '@/utils/catalog-tree';

export interface Obra {
  id: string;
  nombre: string;
  activa: boolean;
}

export function useObras() {
  const { userProfile } = useAuth();
  const uid = userProfile?.uid;
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'obras'),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Obra);
        setObras(next.sort((a, b) => compareNames(a.nombre, b.nombre)));
        setFailed(false);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading obras:', error);
        setFailed(true);
        setLoading(false);
      }
    );
  }, [uid]);

  return { obras, loading, failed };
}
