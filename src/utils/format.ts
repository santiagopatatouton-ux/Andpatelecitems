// Formato de fechas, cantidades y montos, siempre en es-AR.

/** Último nivel de stock considerado bajo. */
export const LOW_STOCK_THRESHOLD = 5;

export type StockLevel = 'available' | 'low' | 'out';

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_THRESHOLD ? 'low' : 'available';
}

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  available: 'Disponible',
  low: 'Stock bajo',
  out: 'Sin stock',
};

export const STOCK_LEVEL_TONES = {
  available: 'success',
  low: 'warning',
  out: 'danger',
} as const;

type TimestampLike =
  | { toDate?: () => Date; seconds?: number }
  | Date
  | string
  | number
  | null
  | undefined;

export function toDate(value: TimestampLike): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

export function toMillis(value: TimestampLike): number {
  return toDate(value)?.getTime() ?? 0;
}

export function formatDateTime(value: TimestampLike, fallback = 'Sin fecha'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

export function formatMoney(value: number): string {
  return `$ ${value.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Evita errores de coma flotante al sumar cantidades con decimales. */
export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Interpreta números escritos a mano: "1500,50", "1.500,50" y "1500.50".
 * Devuelve null si el texto no es un número.
 */
export function parseNumber(input: string): number | null {
  const text = input.trim().replace(/\s|\$/g, '');
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(text)
      ? text.replace(/\./g, '')
      : text;
  if (!/^\d*\.?\d+$/.test(normalized)) return null;
  return Number(normalized);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}
