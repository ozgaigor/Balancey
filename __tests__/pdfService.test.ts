/**
 * Testy generowania PDF A5. Warstwa natywna (expo-print, expo-sharing,
 * expo-file-system) i baza danych są podmienione na atrapy, dzięki czemu
 * sprawdzamy samą zawartość i format dokumentu.
 */

const mockPrintToFile = jest.fn(async (_options: unknown) => ({ uri: 'file:///cache/print.pdf' }));
const mockShare = jest.fn(async (_uri: string, _options: unknown) => undefined);
const mockMove = jest.fn(async (_destination: unknown, _options: unknown) => undefined);

jest.mock('expo-print', () => ({
  printToFileAsync: (options: unknown) => mockPrintToFile(options as never),
  printAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: (uri: string, options: unknown) => mockShare(uri as never, options as never),
}));

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents/' },
  File: class {
    uri: string;
    exists = false;
    constructor(...parts: string[]) {
      this.uri = parts.join('');
    }
    delete() {}
    create() {}
    write() {}
    async move(destination: unknown, options: unknown) {
      return mockMove(destination as never, options as never);
    }
  },
}));

const overview = {
  month: '2026-08',
  summary: {
    income: 580000,
    billsPaid: 163000,
    billsUnpaid: 5000,
    billsTotal: 168000,
    expenses: 127000,
    savings: 50000,
    remaining: 240000,
    remainingAfterUnpaid: 235000,
    outflow: 340000,
    count: 6,
  },
  transactions: [
    {
      id: 1,
      type: 'income',
      amount: 500000,
      categoryId: 1,
      name: 'Pensja',
      description: null,
      date: '2026-08-10',
      month: '2026-08',
      paymentMethod: null,
      isPaid: true,
      dueDate: null,
      paidDate: null,
      goalId: null,
      recurringId: null,
      isDemo: false,
      createdAt: '',
      updatedAt: '',
      categoryName: 'Pensja',
      categoryIcon: 'briefcase-outline',
      categoryColor: '#22C55E',
    },
    {
      id: 2,
      type: 'expense',
      amount: 4250,
      categoryId: 2,
      name: 'Biedronka',
      description: null,
      date: '2026-08-17',
      month: '2026-08',
      paymentMethod: 'card',
      isPaid: true,
      dueDate: null,
      paidDate: null,
      goalId: null,
      recurringId: null,
      isDemo: false,
      createdAt: '',
      updatedAt: '',
      categoryName: 'Jedzenie',
      categoryIcon: 'fast-food-outline',
      categoryColor: '#F0546B',
    },
    {
      id: 3,
      type: 'bill',
      amount: 5000,
      categoryId: 3,
      name: 'Telefon',
      description: null,
      date: '2026-08-15',
      month: '2026-08',
      paymentMethod: null,
      isPaid: false,
      dueDate: '2026-08-15',
      paidDate: null,
      goalId: null,
      recurringId: 9,
      isDemo: false,
      createdAt: '',
      updatedAt: '',
      categoryName: 'Telefon',
      categoryIcon: 'call-outline',
      categoryColor: '#B48CF2',
    },
  ],
  budget: {
    limit: 300000,
    fromDefault: false,
    spent: 127000,
    left: 173000,
    percent: 42,
    barPercent: 42,
    exceeded: false,
    hasLimit: true,
  },
  categorySpending: [],
  categoryBudgets: [],
  unpaidBills: [],
  daysLeft: 15,
  dailyLimit: 11533,
};

jest.mock('../services/budgetService', () => ({
  getMonthOverview: jest.fn(async () => overview),
}));

jest.mock('../db/repositories/savings', () => ({
  listGoals: jest.fn(async () => [
    {
      id: 1,
      name: 'Nowy komputer',
      targetAmount: 600000,
      initialAmount: 190000,
      icon: 'laptop-outline',
      color: '#3FC7C0',
      archived: false,
      isDemo: false,
      savedAmount: 240000,
      percent: 40,
    },
  ]),
}));

import {
  A5_HEIGHT_PT,
  A5_WIDTH_PT,
  buildMonthHtml,
  generateMonthPdf,
  shareMonthPdf,
} from '../services/pdfService';

describe('dokument PDF A5', () => {
  it('ma stronę o rzeczywistym rozmiarze A5', async () => {
    const html = await buildMonthHtml('2026-08');
    expect(html).toContain('@page { size: 148mm 210mm; margin: 0; }');
    expect(html).toContain('width: 148mm');
    expect(A5_WIDTH_PT).toBe(420); // 148 mm w punktach
    expect(A5_HEIGHT_PT).toBe(595); // 210 mm w punktach
  });

  it('zawiera nagłówek z miesiącem i kwotą „Pozostało”', async () => {
    const html = await buildMonthHtml('2026-08');
    expect(html).toContain('Sierpień 2026');
    expect(html).toContain('Pozostało');
    expect(html).toContain('2 400,00 zł');
  });

  it('zawiera wszystkie sekcje wymagane w podsumowaniu', async () => {
    const html = await buildMonthHtml('2026-08');
    for (const section of [
      'Podsumowanie',
      'Przychody',
      'Rachunki',
      'Wydatki według kategorii',
      'Oszczędności',
      'Lista transakcji',
      'Podsumowanie miesiąca',
    ]) {
      expect(html).toContain(section);
    }
  });

  it('wypisuje transakcje wraz z datą i kategorią', async () => {
    const html = await buildMonthHtml('2026-08');
    expect(html).toContain('Biedronka');
    expect(html).toContain('17.08.2026');
    expect(html).toContain('Jedzenie');
    expect(html).toContain('do zapłaty');
  });

  it('pokazuje cele oszczędnościowe', async () => {
    const html = await buildMonthHtml('2026-08');
    expect(html).toContain('Nowy komputer');
    expect(html).toContain('40%');
  });

  it('zabezpiecza znaki specjalne w nazwach', async () => {
    const html = await buildMonthHtml('2026-08');
    expect(html).not.toContain('<script>');
  });

  it('renderuje PDF w rozmiarze A5 i zapisuje plik z czytelną nazwą', async () => {
    const result = await generateMonthPdf('2026-08');

    expect(mockPrintToFile).toHaveBeenCalledWith(
      expect.objectContaining({ width: 420, height: 595 })
    );
    expect(result.fileName).toBe('Budzet-2026-08.pdf');
    expect(mockMove).toHaveBeenCalled();
  });

  it('udostępnia gotowy plik jako PDF', async () => {
    await shareMonthPdf('2026-08');
    expect(mockShare).toHaveBeenCalledWith(
      expect.stringContaining('Budzet-2026-08.pdf'),
      expect.objectContaining({ mimeType: 'application/pdf' })
    );
  });
});
