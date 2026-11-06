import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from './auth-context';
import { roundQuantity } from '@/utils/format';

export interface CartItem {
  path: string[];
  name: string;
  quantity: number;
  unit?: string;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  setQuantity: (path: string[], quantity: number) => void;
  removeItem: (path: string[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart requiere CartProvider');
  return context;
}

const samePath = (a: string[], b: string[]) => a.join('\u0000') === b.join('\u0000');

/** Carrito guardado en el dispositivo, separado por usuario. */
export function CartProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useAuth();
  const storageKey = userProfile ? `andpatelec_cart_${userProfile.uid}` : null;
  // La key descarta el carrito en memoria al cambiar de usuario.
  return (
    <CartStore key={storageKey} storageKey={storageKey}>
      {children}
    </CartStore>
  );
}

function CartStore({ storageKey, children }: { storageKey: string | null; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((json) => {
        if (!cancelled && json) setItems(JSON.parse(json));
      })
      .catch((error) => console.error('Error loading cart:', error));
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const persist = useCallback(
    (change: (current: CartItem[]) => CartItem[]) => {
      setItems((current) => {
        const next = change(current);
        if (storageKey) {
          AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch((error) =>
            console.error('Error saving cart:', error)
          );
        }
        return next;
      });
    },
    [storageKey]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      addItem: (item) =>
        persist((current) => {
          const exists = current.some((entry) => samePath(entry.path, item.path));
          return exists
            ? current.map((entry) =>
                samePath(entry.path, item.path)
                  ? { ...entry, quantity: roundQuantity(entry.quantity + item.quantity) }
                  : entry
              )
            : [...current, item];
        }),
      setQuantity: (path, quantity) =>
        persist((current) =>
          current.map((entry) => (samePath(entry.path, path) ? { ...entry, quantity } : entry))
        ),
      removeItem: (path) =>
        persist((current) => current.filter((entry) => !samePath(entry.path, path))),
      clear: () => persist(() => []),
    }),
    [items, persist]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
