import {
  averageDaily,
  budgetRemaining,
  budgetUsedPercent,
  dailyTotals,
  goalPercent,
  largest,
  percentChange,
  planDifference,
  progressPercent,
  savingFromPercent,
  shareOfTotal,
  suggestedDailyLimit,
  sumAmounts,
  sumByCategory,
  summarize,
  type CalcTransaction,
} from '../utils/calculations';

/** Skrót do budowania transakcji testowych. */
function tx(
  type: CalcTransaction['type'],
  amount: number,
  options: Partial<CalcTransaction> = {}
): CalcTransaction {
  return {
    type,
    amount,
    isPaid: options.isPaid ?? true,
    categoryId: options.categoryId ?? null,
    date: options.date ?? '2026-08-10',
    name: options.name,
  };
}

describe('summarize — podsumowanie miesiąca', () => {
  it('liczy saldo według wzoru przychody - rachunki - wydatki - oszczędności', () => {
    // Przykład z założeń: 7000 - 2000 - 1500 - 1000 = 2500
    const summary = summarize([
      tx('income', 700000),
      tx('bill', 200000),
      tx('expense', 150000),
      tx('saving', 100000),
    ]);

    expect(summary.income).toBe(700000);
    expect(summary.billsPaid).toBe(200000);
    expect(summary.expenses).toBe(150000);
    expect(summary.savings).toBe(100000);
    expect(summary.remaining).toBe(250000);
  });

  it('nie odejmuje nieopłaconych rachunków od salda', () => {
    const summary = summarize([
      tx('income', 500000),
      tx('bill', 150000, { isPaid: true }),
      tx('bill', 8000, { isPaid: false }),
    ]);

    expect(summary.billsPaid).toBe(150000);
    expect(summary.billsUnpaid).toBe(8000);
    expect(summary.billsTotal).toBe(158000);
    expect(summary.remaining).toBe(350000);
    expect(summary.remainingAfterUnpaid).toBe(342000);
  });

  it('zwraca zera dla pustej listy', () => {
    const summary = summarize([]);
    expect(summary.remaining).toBe(0);
    expect(summary.count).toBe(0);
  });

  it('traktuje kwoty jako wartości bezwzględne', () => {
    const summary = summarize([tx('expense', -4250)]);
    expect(summary.expenses).toBe(4250);
  });

  it('dopuszcza ujemne saldo', () => {
    const summary = summarize([tx('income', 100000), tx('expense', 150000)]);
    expect(summary.remaining).toBe(-50000);
  });

  it('sumuje wiele wpisów bez błędów zmiennoprzecinkowych', () => {
    const summary = summarize([tx('expense', 10), tx('expense', 20)]);
    expect(summary.expenses).toBe(30);
  });

  it('zlicza wszystkie transakcje miesiąca', () => {
    const summary = summarize([tx('income', 1000), tx('expense', 500), tx('saving', 100)]);
    expect(summary.count).toBe(3);
    expect(summary.outflow).toBe(600);
  });
});

describe('budżet miesięczny', () => {
  it('liczy procent wykorzystania', () => {
    expect(budgetUsedPercent(185000, 300000)).toBe(62);
    expect(budgetUsedPercent(200000, 300000)).toBe(67);
    expect(budgetUsedPercent(300000, 300000)).toBe(100);
  });

  it('pokazuje przekroczenie ponad 100%', () => {
    expect(budgetUsedPercent(360000, 300000)).toBe(120);
  });

  it('zwraca 0 przy braku limitu', () => {
    expect(budgetUsedPercent(100000, 0)).toBe(0);
  });

  it('liczy pozostałą kwotę, także ujemną', () => {
    expect(budgetRemaining(185000, 300000)).toBe(115000);
    expect(budgetRemaining(360000, 300000)).toBe(-60000);
  });

  it('przycina pasek postępu do 100%', () => {
    expect(progressPercent(360000, 300000)).toBe(100);
    expect(progressPercent(0, 300000)).toBe(0);
    expect(progressPercent(150000, 300000)).toBe(50);
  });
});

describe('sugerowany limit dzienny', () => {
  it('dzieli pozostały budżet na pozostałe dni', () => {
    // 1500 zł / 15 dni = 100 zł dziennie
    expect(suggestedDailyLimit(150000, 15)).toBe(10000);
  });

  it('zaokrągla w dół do pełnych groszy', () => {
    expect(suggestedDailyLimit(10000, 3)).toBe(3333);
  });

  it('zwraca 0, gdy budżet przekroczony lub brak dni', () => {
    expect(suggestedDailyLimit(-5000, 10)).toBe(0);
    expect(suggestedDailyLimit(100000, 0)).toBe(0);
  });
});

describe('sumowanie kategorii', () => {
  const transactions = [
    tx('expense', 24530, { categoryId: 1 }),
    tx('expense', 18970, { categoryId: 1 }),
    tx('expense', 20000, { categoryId: 2 }),
    tx('expense', 5000, { categoryId: null }),
    tx('income', 500000, { categoryId: 3 }),
    tx('bill', 8000, { categoryId: 4, isPaid: false }),
  ];

  it('sumuje wydatki w rozbiciu na kategorie, malejąco', () => {
    const totals = sumByCategory(transactions, 'expense');
    expect(totals).toEqual([
      { categoryId: 1, total: 43500, count: 2 },
      { categoryId: 2, total: 20000, count: 1 },
      { categoryId: null, total: 5000, count: 1 },
    ]);
  });

  it('pomija nieopłacone rachunki', () => {
    const totals = sumByCategory(transactions, 'bill');
    expect(totals).toEqual([]);
  });

  it('liczy udział kategorii w całości', () => {
    expect(shareOfTotal(43500, 68500)).toBe(63.5);
    expect(shareOfTotal(1000, 0)).toBe(0);
  });

  it('sumuje wszystkie kwoty', () => {
    expect(sumAmounts([tx('expense', 100), tx('income', 250)])).toBe(350);
  });
});

describe('statystyki', () => {
  it('liczy średni dzienny wydatek', () => {
    expect(averageDaily(150000, 15)).toBe(10000);
    expect(averageDaily(100000, 0)).toBe(0);
  });

  it('znajduje największy wydatek', () => {
    const biggest = largest(
      [tx('expense', 4250), tx('expense', 20000), tx('income', 500000)],
      'expense'
    );
    expect(biggest?.amount).toBe(20000);
  });

  it('liczy zmianę procentową względem poprzedniego miesiąca', () => {
    expect(percentChange(88000, 100000)).toBe(-12);
    expect(percentChange(112000, 100000)).toBe(12);
    expect(percentChange(100000, 0)).toBeNull();
  });

  it('grupuje wydatki po dniach', () => {
    const totals = dailyTotals(
      [
        tx('expense', 4250, { date: '2026-08-17' }),
        tx('expense', 10000, { date: '2026-08-17' }),
        tx('expense', 1200, { date: '2026-08-16' }),
        tx('income', 500000, { date: '2026-08-16' }),
      ],
      'expense'
    );

    expect(totals).toEqual([
      { date: '2026-08-16', total: 1200 },
      { date: '2026-08-17', total: 14250 },
    ]);
  });
});

describe('plan i cele', () => {
  it('liczy różnicę między planem a rzeczywistością', () => {
    // Plan 2500 zł, rzeczywiście 2730 zł -> +230 zł
    expect(planDifference(250000, 273000)).toBe(23000);
    expect(planDifference(250000, 240000)).toBe(-10000);
  });

  it('liczy postęp celu oszczędnościowego', () => {
    expect(goalPercent(240000, 600000)).toBe(40);
    expect(goalPercent(0, 600000)).toBe(0);
    expect(goalPercent(100000, 0)).toBe(0);
  });

  it('wylicza oszczędności jako procent dochodu', () => {
    expect(savingFromPercent(500000, 10)).toBe(50000);
    expect(savingFromPercent(500000, 0)).toBe(0);
  });
});

describe('pełny scenariusz miesiąca', () => {
  it('odwzorowuje przykładowy miesiąc z założeń', () => {
    const transactions = [
      tx('income', 500000, { name: 'Pensja' }),
      tx('income', 100000, { name: 'Dodatkowa praca' }),
      tx('bill', 150000, { name: 'Czynsz', isPaid: true }),
      tx('bill', 8000, { name: 'Internet', isPaid: true }),
      tx('bill', 5000, { name: 'Telefon', isPaid: false }),
      tx('expense', 60000, { categoryId: 1, name: 'Jedzenie' }),
      tx('expense', 25000, { categoryId: 2, name: 'Transport' }),
      tx('expense', 30000, { categoryId: 3, name: 'Zakupy' }),
      tx('expense', 10000, { categoryId: 4, name: 'Rozrywka' }),
      tx('saving', 50000, { name: 'Oszczędności' }),
    ];

    const summary = summarize(transactions);

    expect(summary.income).toBe(600000);
    expect(summary.billsPaid).toBe(158000);
    expect(summary.billsUnpaid).toBe(5000);
    expect(summary.expenses).toBe(125000);
    expect(summary.savings).toBe(50000);
    // 6000 - 1580 - 1250 - 500 = 2670 zł
    expect(summary.remaining).toBe(267000);
    expect(summary.remainingAfterUnpaid).toBe(262000);

    const budgetLimit = 300000; // 3000 zł
    expect(budgetUsedPercent(summary.expenses, budgetLimit)).toBe(42);
    expect(budgetRemaining(summary.expenses, budgetLimit)).toBe(175000);
    expect(suggestedDailyLimit(175000, 14)).toBe(12500);

    const byCategory = sumByCategory(transactions, 'expense');
    expect(byCategory[0]).toEqual({ categoryId: 1, total: 60000, count: 1 });
    expect(byCategory.reduce((sum, item) => sum + item.total, 0)).toBe(summary.expenses);
  });
});
