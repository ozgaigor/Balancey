/**
 * Motyw aplikacji — jedno źródło prawdy dla kolorów, odstępów i typografii.
 * Domyślnie ciemny, oszczędny w kolorach: akcent zielony + czerwień dla wydatków.
 */

export const colors = {
  /** Tło aplikacji — bardzo ciemne. */
  bg: '#0B0F13',
  /** Tło kart — delikatnie jaśniejsze od tła. */
  card: '#151A21',
  /** Tło elementów wewnątrz kart (pola, chipy). */
  surface: '#1D242D',
  surfaceStrong: '#28313C',
  border: '#252E38',

  text: '#F2F5F8',
  textMuted: '#93A1B0',
  textFaint: '#66727F',

  /** Akcent — przychody, potwierdzenia, paski postępu. */
  accent: '#22C55E',
  accentSoft: 'rgba(34, 197, 94, 0.16)',
  accentDark: '#16A34A',

  /** Wydatki i przekroczenia. */
  danger: '#F0546B',
  dangerSoft: 'rgba(240, 84, 107, 0.16)',

  /** Ostrzeżenia (np. 80% budżetu, rachunek do zapłaty). */
  warning: '#F5A524',
  warningSoft: 'rgba(245, 165, 36, 0.16)',

  /** Rachunki. */
  bills: '#7C9CF5',
  billsSoft: 'rgba(124, 156, 245, 0.16)',

  /** Oszczędności. */
  savings: '#3FC7C0',
  savingsSoft: 'rgba(63, 199, 192, 0.16)',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  /** Duże liczby na kartach. */
  display: 34,
  h1: 24,
  h2: 19,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

/** Minimalny rozmiar pola dotykowego (wytyczne dostępności). */
export const HIT_SIZE = 48;

/** Kolor przypisany do typu transakcji. */
export function typeColor(type: 'income' | 'bill' | 'expense' | 'saving'): string {
  switch (type) {
    case 'income':
      return colors.accent;
    case 'bill':
      return colors.bills;
    case 'saving':
      return colors.savings;
    default:
      return colors.danger;
  }
}

/** Miękkie tło przypisane do typu transakcji. */
export function typeSoftColor(type: 'income' | 'bill' | 'expense' | 'saving'): string {
  switch (type) {
    case 'income':
      return colors.accentSoft;
    case 'bill':
      return colors.billsSoft;
    case 'saving':
      return colors.savingsSoft;
    default:
      return colors.dangerSoft;
  }
}

/** Polska nazwa typu transakcji. */
export function typeLabel(type: 'income' | 'bill' | 'expense' | 'saving', plural = false): string {
  switch (type) {
    case 'income':
      return plural ? 'Przychody' : 'Przychód';
    case 'bill':
      return plural ? 'Rachunki' : 'Rachunek';
    case 'saving':
      return plural ? 'Oszczędności' : 'Oszczędności';
    default:
      return plural ? 'Wydatki' : 'Wydatek';
  }
}

/** Ikona (Ionicons) przypisana do typu transakcji. */
export function typeIcon(type: 'income' | 'bill' | 'expense' | 'saving'): string {
  switch (type) {
    case 'income':
      return 'arrow-down-circle-outline';
    case 'bill':
      return 'receipt-outline';
    case 'saving':
      return 'wallet-outline';
    default:
      return 'arrow-up-circle-outline';
  }
}
