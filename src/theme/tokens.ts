// Tokens de diseño. Las pantallas no usan colores ni tamaños sueltos: todo sale de acá.

export const colors = {
  ink: '#14181F',
  inkRaised: '#222934',
  inkBorder: '#333C49',
  onInk: '#F5F6F8',
  onInkMuted: '#AEB6C2',

  brand: '#FFC800',
  brandSoft: '#FFF5CF',
  onBrand: '#14181F',

  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceSunken: '#ECEEF1',
  border: '#DDE0E5',
  borderStrong: '#B9BFC9',

  text: '#14181F',
  textMuted: '#525C6B',
  textSubtle: '#646E7D',
  placeholder: '#6F7886',

  success: '#0B7048',
  successSoft: '#E1F3EA',
  warning: '#9A5300',
  warningSoft: '#FCEFD9',
  danger: '#BF2424',
  dangerSoft: '#FBE7E7',
  info: '#1C58B5',
  infoSoft: '#E5EEFA',

  scrim: 'rgba(20, 24, 31, 0.56)',
} as const;

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceSunken },
  success: { fg: colors.success, bg: colors.successSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 999,
} as const;

export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
} as const;

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
} as const;

export type TypographyVariant = keyof typeof typography;

export const iconSize = { sm: 16, md: 20, lg: 24 } as const;
export const iconStroke = 2;

export const layout = {
  /** Ancho desde el que se muestra la barra lateral en lugar de las pestañas. */
  sidebarBreakpoint: 900,
  sidebarWidth: 248,
  contentMaxWidth: 1040,
  touchTarget: 44,
} as const;
