import {
  addDays,
  addMonths,
  currentYearMonth,
  daysElapsedInMonth,
  daysInMonth,
  daysLeftInMonth,
  dueDateForMonth,
  formatDateLong,
  formatDatePL,
  isValidISODate,
  isValidYearMonth,
  monthBounds,
  monthLabel,
  monthLabelShort,
  monthRange,
  monthsDiff,
  relativeDayLabel,
  todayISO,
  yearMonthOf,
} from '../utils/dates';

describe('poprawność dat', () => {
  it('akceptuje istniejące daty', () => {
    expect(isValidISODate('2026-08-17')).toBe(true);
    expect(isValidISODate('2024-02-29')).toBe(true); // rok przestępny
  });

  it('odrzuca daty nieistniejące', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2025-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('17.08.2026')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('sprawdza format miesiąca', () => {
    expect(isValidYearMonth('2026-08')).toBe(true);
    expect(isValidYearMonth('2026-00')).toBe(false);
    expect(isValidYearMonth('2026-8')).toBe(false);
  });

  it('zna długości miesięcy', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe('formatowanie po polsku', () => {
  it('formatuje datę jako DD.MM.RRRR', () => {
    expect(formatDatePL('2026-08-17')).toBe('17.08.2026');
    expect(formatDatePL('2026-01-05')).toBe('05.01.2026');
  });

  it('formatuje datę słownie', () => {
    expect(formatDateLong('2026-08-17')).toBe('17 sierpnia 2026');
    expect(formatDateLong('2026-03-01')).toBe('1 marca 2026');
  });

  it('formatuje miesiąc z wielkiej litery', () => {
    expect(monthLabel('2026-08')).toBe('Sierpień 2026');
    expect(monthLabel('2026-12')).toBe('Grudzień 2026');
    expect(monthLabelShort('2026-08')).toBe('sie 2026');
  });

  it('pokazuje etykiety względne', () => {
    expect(relativeDayLabel('2026-08-17', '2026-08-17')).toBe('Dzisiaj');
    expect(relativeDayLabel('2026-08-16', '2026-08-17')).toBe('Wczoraj');
    expect(relativeDayLabel('2026-08-18', '2026-08-17')).toBe('Jutro');
    expect(relativeDayLabel('2026-08-10', '2026-08-17')).toBe('10.08.2026');
  });
});

describe('operacje na miesiącach', () => {
  it('przesuwa miesiące przez granicę roku', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-08', 0)).toBe('2026-08');
    expect(addMonths('2026-08', 12)).toBe('2027-08');
  });

  it('liczy różnicę miesięcy', () => {
    expect(monthsDiff('2026-08', '2026-11')).toBe(3);
    expect(monthsDiff('2026-11', '2026-08')).toBe(-3);
  });

  it('buduje zakres miesięcy', () => {
    expect(monthRange('2026-06', '2026-08')).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(monthRange('2026-08', '2026-06')).toEqual([]);
  });

  it('podaje granice miesiąca', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthBounds('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });

  it('wyciąga miesiąc z daty', () => {
    expect(yearMonthOf('2026-08-17')).toBe('2026-08');
  });
});

describe('dni w miesiącu — limit dzienny i średnie', () => {
  it('liczy pozostałe dni razem z dzisiejszym', () => {
    expect(daysLeftInMonth('2026-08', '2026-08-17')).toBe(15);
    expect(daysLeftInMonth('2026-08', '2026-08-31')).toBe(1);
  });

  it('dla przyszłego miesiąca zwraca pełną liczbę dni', () => {
    expect(daysLeftInMonth('2026-09', '2026-08-17')).toBe(30);
  });

  it('dla przeszłego miesiąca zwraca zero', () => {
    expect(daysLeftInMonth('2026-07', '2026-08-17')).toBe(0);
  });

  it('liczy dni, które już minęły', () => {
    expect(daysElapsedInMonth('2026-08', '2026-08-17')).toBe(17);
    expect(daysElapsedInMonth('2026-07', '2026-08-17')).toBe(31);
    expect(daysElapsedInMonth('2026-09', '2026-08-17')).toBe(0);
  });
});

describe('terminy rachunków cyklicznych', () => {
  it('ustawia termin na wskazany dzień', () => {
    expect(dueDateForMonth('2026-08', 10)).toBe('2026-08-10');
  });

  it('przycina dzień do długości miesiąca', () => {
    expect(dueDateForMonth('2026-02', 31)).toBe('2026-02-28');
    expect(dueDateForMonth('2024-02', 30)).toBe('2024-02-29');
    expect(dueDateForMonth('2026-04', 31)).toBe('2026-04-30');
  });
});

describe('przesuwanie dni', () => {
  it('przechodzi przez granicę miesiąca', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('bieżąca data', () => {
  it('zwraca datę w formacie ISO', () => {
    expect(isValidISODate(todayISO())).toBe(true);
    expect(isValidYearMonth(currentYearMonth())).toBe(true);
    expect(yearMonthOf(todayISO())).toBe(currentYearMonth());
  });

  it('używa czasu lokalnego, nie UTC', () => {
    // 1 stycznia o 00:30 czasu lokalnego data lokalna to nadal 1 stycznia
    const localMidnight = new Date(2026, 0, 1, 0, 30, 0);
    expect(todayISO(localMidnight)).toBe('2026-01-01');
  });
});
