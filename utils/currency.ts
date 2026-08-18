/**
 * Obsługa kwot. Kwoty w całej aplikacji to liczby całkowite w groszach.
 * Formatowanie i parsowanie są napisane ręcznie (bez Intl), aby wynik był
 * identyczny na każdym urządzeniu i w pełni testowalny.
 */

/** Twarda spacja używana jako separator tysięcy w polskim formacie. */
export const NBSP = ' ';

export const DEFAULT_CURRENCY = 'PLN';
export const DEFAULT_SYMBOL = 'zł';

export interface FormatOptions {
  /** Symbol waluty; pusty ciąg = bez symbolu. */
  symbol?: string;
  /** 'auto' – minus tylko dla ujemnych, 'always' – zawsze +/-, 'none' – bez znaku. */
  sign?: 'auto' | 'always' | 'none';
  /** Czy pokazywać grosze (domyślnie tak). */
  decimals?: boolean;
}

/**
 * Formatuje grosze do polskiego zapisu.
 * 4250 -> "42,50 zł", 100000 -> "1 000,00 zł"
 */
export function formatMoney(grosze: number, options: FormatOptions = {}): string {
  const { symbol = DEFAULT_SYMBOL, sign = 'auto', decimals = true } = options;
  const safe = Number.isFinite(grosze) ? Math.round(grosze) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);

  const zloty = Math.floor(abs / 100);
  const cents = abs % 100;

  let out = groupDigits(String(zloty));
  if (decimals) {
    out += ',' + String(cents).padStart(2, '0');
  }

  let prefix = '';
  if (sign === 'always') {
    prefix = negative ? '-' : '+';
  } else if (sign === 'auto' && negative) {
    prefix = '-';
  }

  return symbol ? `${prefix}${out}${NBSP}${symbol}` : `${prefix}${out}`;
}

/**
 * Formatuje kwotę transakcji ze znakiem zależnym od typu:
 * przychód -> "+5 000,00 zł", pozostałe -> "-42,50 zł".
 */
export function formatSignedForType(
  grosze: number,
  type: 'income' | 'bill' | 'expense' | 'saving',
  symbol = DEFAULT_SYMBOL
): string {
  const abs = Math.abs(grosze);
  return formatMoney(type === 'income' ? abs : -abs, { symbol, sign: 'always' });
}

/** Wstawia twarde spacje co trzy cyfry: "1234567" -> "1 234 567". */
export function groupDigits(digits: string): string {
  let out = '';
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    out = digits[i] + out;
    count += 1;
    if (count % 3 === 0 && i > 0) {
      out = NBSP + out;
    }
  }
  return out;
}

/**
 * Parsuje tekst wpisany przez użytkownika na grosze.
 * Akceptuje: "42,50", "42.5", "1 234,56", "1234", "-20".
 * Zwraca null, jeżeli tekst nie jest poprawną kwotą.
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .replace(/ /g, '')
    .replace(/\s/g, '')
    .replace(/zł/gi, '')
    .replace(',', '.')
    .trim();
  if (cleaned === '' || cleaned === '-') return null;

  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;

  const [, minus, wholeRaw, fracRaw] = match;
  const whole = wholeRaw === '' ? '0' : wholeRaw;
  if (wholeRaw === '' && (fracRaw === undefined || fracRaw === '')) return null;

  const zloty = Number.parseInt(whole, 10);
  if (!Number.isFinite(zloty)) return null;

  let cents = 0;
  if (fracRaw && fracRaw.length > 0) {
    const twoDigits = fracRaw.slice(0, 2).padEnd(2, '0');
    cents = Number.parseInt(twoDigits, 10);
    // zaokrąglenie na podstawie trzeciej cyfry — bez liczb zmiennoprzecinkowych
    if (fracRaw.length > 2 && Number.parseInt(fracRaw[2], 10) >= 5) {
      cents += 1;
    }
  }

  const total = zloty * 100 + cents;
  return minus === '-' ? -total : total;
}

/**
 * Zamienia ciąg cyfr z klawiatury numerycznej na grosze.
 * "4250" -> 4250 (czyli 42,50 zł). Używane w szybkim dodawaniu wydatku.
 */
export function digitsToGrosze(digits: string): number {
  const onlyDigits = digits.replace(/\D/g, '').slice(0, 11);
  if (onlyDigits === '') return 0;
  return Number.parseInt(onlyDigits, 10);
}

/** Podgląd kwoty wpisywanej na klawiaturze: "4250" -> "42,50". */
export function formatDigitsPreview(digits: string): string {
  return formatMoney(digitsToGrosze(digits), { symbol: '' });
}

/** Zapis kwoty do plików CSV (polski przecinek dziesiętny, bez separatora tysięcy). */
export function moneyToPlainString(grosze: number): string {
  const negative = grosze < 0;
  const abs = Math.abs(Math.round(grosze));
  const value = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${value}` : value;
}

/** Skrócony zapis dla wykresów: 125000 -> "1,3 tys." */
export function formatCompact(grosze: number, symbol = DEFAULT_SYMBOL): string {
  const zloty = Math.round(grosze / 100);
  if (Math.abs(zloty) >= 1000) {
    const thousands = Math.round(Math.abs(zloty) / 100) / 10;
    const sign = zloty < 0 ? '-' : '';
    return `${sign}${String(thousands).replace('.', ',')}${NBSP}tys.${symbol ? NBSP + symbol : ''}`;
  }
  return `${groupDigits(String(zloty))}${symbol ? NBSP + symbol : ''}`;
}
