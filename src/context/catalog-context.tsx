import { collection, doc, onSnapshot } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from './auth-context';
import { db } from '@/lib/firebase';
import { getItems, type CatalogEntry, type CatalogTree } from '@/utils/catalog-tree';
import { stockLevel, type StockLevel } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';

export interface StockInfo {
  stock: number;
  unitOfMeasure?: string;
  unitCost?: number | null;
  imageUrl?: string | null;
  minStock?: number;
  code?: string;
}

export interface CatalogItem extends CatalogEntry {
  id: string;
  stock: number;
  level: StockLevel;
  unitOfMeasure?: string;
  unitCost?: number | null;
  minStock?: number;
  code?: string;
}

interface CatalogContextValue {
  tree: CatalogTree | null;
  loading: boolean;
  error: boolean;
  /** Ítems del catálogo con su stock. Sin documento de stock cuentan como 0. */
  items: CatalogItem[];
  counts: Record<StockLevel, number>;
  stockById: Record<string, StockInfo>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog requiere CatalogProvider');
  return context;
}

/** Una sola suscripción al catálogo y al stock para toda la app. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useAuth();
  const uid = userProfile?.uid;
  const [tree, setTree] = useState<CatalogTree | null>(null);
  const [stockById, setStockById] = useState<Record<string, StockInfo>>({});
  const [treeLoaded, setTreeLoaded] = useState(false);
  const [stockLoaded, setStockLoaded] = useState(false);
  const [treeError, setTreeError] = useState(false);
  const [stockError, setStockError] = useState(false);
  const loading = !treeLoaded || !stockLoaded;
  const error = treeError || stockError;

  useEffect(() => {
    if (!uid) return;

    const stopTree = onSnapshot(
      doc(db, 'catalog', 'tree'),
      (snapshot) => {
        setTree((snapshot.data() ?? {}) as CatalogTree);
        setTreeError(false);
        setTreeLoaded(true);
      },
      (failure) => {
        console.error('Error loading catalog:', failure);
        setTreeError(true);
        setTreeLoaded(true);
      }
    );

    const stopStock = onSnapshot(
      collection(db, 'stock'),
      (snapshot) => {
        const next: Record<string, StockInfo> = {};
        snapshot.docs.forEach((stockDoc) => {
          next[stockDoc.id] = stockDoc.data() as StockInfo;
        });
        setStockById(next);
        setStockError(false);
        setStockLoaded(true);
      },
      (failure) => {
        console.error('Error loading stock:', failure);
        setStockError(true);
        setStockLoaded(true);
      }
    );

    return () => {
      stopTree();
      stopStock();
    };
  }, [uid]);

  const value = useMemo<CatalogContextValue>(() => {
    const items = (tree ? getItems(tree) : []).map((entry) => {
      const id = pathToDocId(entry.path);
      const info = stockById[id];
      const stock = info?.stock ?? 0;
      return {
        ...entry,
        id,
        stock,
        level: stockLevel(stock, info?.minStock),
        unitOfMeasure: info?.unitOfMeasure,
        unitCost: info?.unitCost,
        minStock: info?.minStock,
        code: info?.code,
      };
    });

    const counts = { available: 0, low: 0, out: 0 };
    items.forEach((item) => counts[item.level]++);

    return { tree, loading, error, items, counts, stockById };
  }, [tree, stockById, loading, error]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
