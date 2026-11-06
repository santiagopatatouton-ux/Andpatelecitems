export interface Unit {
  value: string;
  label: string;
  plural: string;
  short: string;
  /** Si admite cantidades con decimales, como 1,5 metros. */
  decimal: boolean;
}

export const UNITS: Unit[] = [
  { value: 'unidad', label: 'Unidad', plural: 'Unidades', short: 'u', decimal: false },
  { value: 'metro', label: 'Metro', plural: 'Metros', short: 'm', decimal: true },
  { value: 'rollo', label: 'Rollo', plural: 'Rollos', short: 'rollo', decimal: false },
  { value: 'caja', label: 'Caja', plural: 'Cajas', short: 'caja', decimal: false },
  { value: 'pack', label: 'Pack', plural: 'Packs', short: 'pack', decimal: false },
  { value: 'kg', label: 'Kilogramo', plural: 'Kilogramos', short: 'kg', decimal: true },
  { value: 'litro', label: 'Litro', plural: 'Litros', short: 'lt', decimal: true },
  { value: 'tramo', label: 'Tramo', plural: 'Tramos', short: 'tramo', decimal: false },
];

export function getUnit(value: string | undefined): Unit {
  return UNITS.find((unit) => unit.value === value) ?? UNITS[0];
}

export function unitLabel(unit: Unit, quantity: number): string {
  return (quantity === 1 ? unit.label : unit.plural).toLowerCase();
}
