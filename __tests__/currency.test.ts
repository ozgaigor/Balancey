import {
  NBSP,
  digitsToGrosze,
  formatCompact,
  formatDigitsPreview,
  formatMoney,
  formatSignedForType,
  groupDigits,
  moneyToPlainString,
  parseAmount,
} from '../utils/currency';

describe('formatMoney — polski format kwot', () => {
  it('formatuje pełne złotówki z groszami', () => {
    expect(formatMoney(4250)).toBe(`42,50${NBSP}zł`);
  });

  it('dodaje separator tysięcy', () => {
    expect(formatMoney(100000)).toBe(`1${NBSP}000,00${NBSP}zł`);
    expect(formatMoney(123456789)).toBe(`1${NBSP}234${NBSP}567,89${NBSP}zł`);
  });

  it('nigdy nie pokazuje formatu 1000.00', () => {
    expect(formatMoney(100000)).not.toContain('.');
  });

  it('obsługuje zero i wartości ujemne', () => {
    expect(formatMoney(0)).toBe(`0,00${NBSP}zł`);
    expect(formatMoney(-4250)).toBe(`-42,50${NBSP}zł`);
  });

  it('potrafi pominąć symbol i grosze', () => {
    expect(formatMoney(4250, { symbol: '' })).toBe('42,50');
    expect(formatMoney(450000, { decimals: false })).toBe(`4${NBSP}500${NBSP}zł`);
  });

  it('wymusza znak, gdy poproszono', () => {
    expect(formatMoney(500000, { sign: 'always' })).toBe(`+5${NBSP}000,00${NBSP}zł`);
  });

  it('dobiera znak do typu transakcji', () => {
    expect(formatSignedForType(4250, 'expense')).toBe(`-42,50${NBSP}zł`);
    expect(formatSignedForType(500000, 'income')).toBe(`+5${NBSP}000,00${NBSP}zł`);
    expect(formatSignedForType(8000, 'bill')).toBe(`-80,00${NBSP}zł`);
    expect(formatSignedForType(100000, 'saving')).toBe(`-1${NBSP}000,00${NBSP}zł`);
  });

  it('obsługuje inne symbole walut', () => {
    expect(formatMoney(4250, { symbol: '€' })).toBe(`42,50${NBSP}€`);
  });
});

describe('groupDigits', () => {
  it('grupuje cyfry po trzy', () => {
    expect(groupDigits('1234567')).toBe(`1${NBSP}234${NBSP}567`);
    expect(groupDigits('12')).toBe('12');
    expect(groupDigits('1000')).toBe(`1${NBSP}000`);
  });
});

describe('parseAmount — wpisywanie kwot przez użytkownika', () => {
  it('czyta polski zapis z przecinkiem', () => {
    expect(parseAmount('42,50')).toBe(4250);
  });

  it('czyta zapis z kropką', () => {
    expect(parseAmount('42.5')).toBe(4250);
  });

  it('ignoruje spacje i symbol waluty', () => {
    expect(parseAmount('1 234,56 zł')).toBe(123456);
    expect(parseAmount(`1${NBSP}234,56`)).toBe(123456);
  });

  it('traktuje liczbę całkowitą jako złotówki', () => {
    expect(parseAmount('1000')).toBe(100000);
  });

  it('zaokrągla trzecią cyfrę po przecinku', () => {
    expect(parseAmount('10,005')).toBe(1001);
    expect(parseAmount('10,004')).toBe(1000);
  });

  it('obsługuje wartości ujemne', () => {
    expect(parseAmount('-20')).toBe(-2000);
  });

  it('odrzuca teksty, które nie są kwotą', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12,3,4')).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });

  it('nie gubi precyzji jak liczby zmiennoprzecinkowe', () => {
    // 0.1 + 0.2 w groszach to zwykłe dodawanie liczb całkowitych
    const a = parseAmount('0,10') as number;
    const b = parseAmount('0,20') as number;
    expect(a + b).toBe(30);
    expect(formatMoney(a + b)).toBe(`0,30${NBSP}zł`);
  });
});

describe('klawiatura numeryczna', () => {
  it('zamienia ciąg cyfr na grosze', () => {
    expect(digitsToGrosze('4250')).toBe(4250);
    expect(digitsToGrosze('')).toBe(0);
    expect(digitsToGrosze('007')).toBe(7);
  });

  it('pokazuje podgląd wpisywanej kwoty', () => {
    expect(formatDigitsPreview('4250')).toBe('42,50');
    expect(formatDigitsPreview('5')).toBe('0,05');
  });
});

describe('zapis kwot do plików', () => {
  it('używa przecinka bez separatora tysięcy', () => {
    expect(moneyToPlainString(123456)).toBe('1234,56');
    expect(moneyToPlainString(-4250)).toBe('-42,50');
  });

  it('skraca duże kwoty na wykresach', () => {
    expect(formatCompact(125000)).toBe(`1,3${NBSP}tys.${NBSP}zł`);
    expect(formatCompact(45000)).toBe(`450${NBSP}zł`);
  });
});
