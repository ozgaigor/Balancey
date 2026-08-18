/**
 * Obsługa dat w formacie ISO (YYYY-MM-DD) oraz miesięcy (YYYY-MM).
 * Wszystkie operacje wykonywane są na składowych daty, nie na znacznikach czasu,
 * dzięki czemu strefa czasowa ani zmiana czasu nie zmieniają wyników.
 */

export const MONTHS_NOMINATIVE = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
] as const;

export const MONTHS_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
] as const;

export const MONTHS_SHORT = [
  'sty',
  'lut',
  'mar',
  'kwi',
  'maj',
  'cze',
  'lip',
  'sie',
  'wrz',
  'paź',
  'lis',
  'gru',
] as const;

export const WEEKDAYS_SHORT = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'] as const;

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Liczba dni w miesiącu (obsługuje lata przestępne). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Czy ciąg jest poprawną datą ISO i czy taki dzień istnieje w kalendarzu. */
export function isValidISODate(value: string): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return year >= 1900 && year <= 2200;
}

/** Czy ciąg jest poprawnym miesiącem YYYY-MM. */
export function isValidYearMonth(value: string): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function toParts(iso: string): DateParts {
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  return { year, month, day };
}

export function fromParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
}

/** Dzisiejsza data w czasie lokalnym urządzenia. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Bieżący miesiąc w formacie YYYY-MM. */
export function currentYearMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** Miesiąc, do którego należy data: "2026-08-17" -> "2026-08". */
export function yearMonthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Przesuwa miesiąc o zadaną liczbę miesięcy: ("2026-12", 1) -> "2027-01". */
export function addMonths(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map((part) => Number(part));
  const zeroBased = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return `${newYear}-${pad2(newMonth)}`;
}

/** Różnica w miesiącach: ("2026-08", "2026-11") -> 3. */
export function monthsDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ty * 12 + tm - (fy * 12 + fm);
}

/** Lista miesięcy od `from` do `to` włącznie. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  const count = monthsDiff(from, to);
  if (count < 0) return out;
  for (let i = 0; i <= count; i += 1) {
    out.push(addMonths(from, i));
  }
  return out;
}

/** Pierwszy i ostatni dzień miesiąca jako daty ISO. */
export function monthBounds(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${pad2(daysInMonth(year, month))}`,
  };
}

/** Etykieta miesiąca z wielkiej litery: "2026-08" -> "Sierpień 2026". */
export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const name = MONTHS_NOMINATIVE[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** Krótka etykieta miesiąca: "2026-08" -> "sie 2026". */
export function monthLabelShort(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${MONTHS_SHORT[month - 1] ?? ''} ${year}`;
}

/** Data w polskim formacie: "2026-08-17" -> "17.08.2026". */
export function formatDatePL(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  const { year, month, day } = toParts(iso);
  return `${pad2(day)}.${pad2(month)}.${year}`;
}

/** Data słownie: "2026-08-17" -> "17 sierpnia 2026". */
export function formatDateLong(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  const { year, month, day } = toParts(iso);
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`;
}

/** Dzień tygodnia dla daty ISO (0 = niedziela). */
export function weekdayOf(iso: string): number {
  const { year, month, day } = toParts(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Liczba dni między datami (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = toParts(a);
  const pb = toParts(b);
  const ua = Date.UTC(pa.year, pa.month - 1, pa.day);
  const ub = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((ub - ua) / 86400000);
}

/** Przesuwa datę o zadaną liczbę dni. */
export function addDays(iso: string, delta: number): string {
  const { year, month, day } = toParts(iso);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Etykieta względna: "Dzisiaj", "Wczoraj", "Jutro" lub data. */
export function relativeDayLabel(iso: string, today: string = todayISO()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Dzisiaj';
  if (diff === -1) return 'Wczoraj';
  if (diff === 1) return 'Jutro';
  return formatDatePL(iso);
}

/**
 * Ile dni pozostało do końca miesiąca (łącznie z dniem dzisiejszym).
 * Dla miesiąca w przyszłości zwraca pełną liczbę dni, dla przeszłego 0.
 */
export function daysLeftInMonth(yearMonth: string, today: string = todayISO()): number {
  const [year, month] = yearMonth.split('-').map(Number);
  const total = daysInMonth(year, month);
  const currentMonth = yearMonthOf(today);
  if (yearMonth > currentMonth) return total;
  if (yearMonth < currentMonth) return 0;
  const { day } = toParts(today);
  return Math.max(total - day + 1, 0);
}

/**
 * Ile dni miesiąca już minęło (łącznie z dziś) — do średniej dziennej.
 * Dla miesiąca przeszłego zwraca liczbę dni miesiąca, dla przyszłego 0.
 */
export function daysElapsedInMonth(yearMonth: string, today: string = todayISO()): number {
  const [year, month] = yearMonth.split('-').map(Number);
  const total = daysInMonth(year, month);
  const currentMonth = yearMonthOf(today);
  if (yearMonth < currentMonth) return total;
  if (yearMonth > currentMonth) return 0;
  return toParts(today).day;
}

/** Termin rachunku w danym miesiącu dla cyklu "każdego N dnia miesiąca". */
export function dueDateForMonth(yearMonth: string, dayOfMonth: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const day = Math.min(Math.max(dayOfMonth, 1), daysInMonth(year, month));
  return `${yearMonth}-${pad2(day)}`;
}

/** Znacznik czasu ISO używany w kolumnach created_at / updated_at. */
export function nowTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}
