/**
 * Testy automatycznego tworzenia rachunków cyklicznych.
 * Repozytoria bazy są podmienione na atrapy — sprawdzamy samą logikę.
 */

const mockListRecurring = jest.fn();
const mockExists = jest.fn();
const mockCreate = jest.fn(async (_input: unknown) => 1);

jest.mock('../db/repositories/recurring', () => ({
  listRecurringForMonth: (month: string) => mockListRecurring(month),
}));

jest.mock('../db/repositories/transactions', () => ({
  existsForRecurring: (id: number, month: string) => mockExists(id, month),
  createTransaction: (input: unknown) => mockCreate(input as never),
}));

import { ensureRecurringForMonth } from '../services/recurringService';
import { currentYearMonth } from '../utils/dates';

const internet = {
  id: 1,
  type: 'bill' as const,
  name: 'Internet',
  amount: 8000,
  categoryId: 5,
  dayOfMonth: 10,
  paymentMethod: null,
  note: null,
  autoCreate: true,
  active: true,
  startMonth: '2026-01',
  endMonth: null,
  isDemo: false,
  categoryName: 'Internet',
  categoryIcon: 'wifi-outline',
  categoryColor: '#4FD1C5',
};

const netflix = {
  ...internet,
  id: 2,
  type: 'expense' as const,
  name: 'Netflix',
  amount: 4000,
  dayOfMonth: 5,
};

beforeEach(() => {
  mockListRecurring.mockReset();
  mockExists.mockReset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue(1);
});

describe('ensureRecurringForMonth', () => {
  it('tworzy rachunek ze statusem „do zapłaty” i terminem w danym miesiącu', async () => {
    mockListRecurring.mockResolvedValue([internet]);
    mockExists.mockResolvedValue(false);

    const created = await ensureRecurringForMonth('2026-08');

    expect(created).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bill',
        amount: 8000,
        name: 'Internet',
        date: '2026-08-10',
        dueDate: '2026-08-10',
        isPaid: false,
        recurringId: 1,
      })
    );
  });

  it('nie duplikuje pozycji, która już istnieje w tym miesiącu', async () => {
    mockListRecurring.mockResolvedValue([internet]);
    mockExists.mockResolvedValue(true);

    const created = await ensureRecurringForMonth('2026-09');

    expect(created).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('wydatek cykliczny zapisuje od razu jako opłacony', async () => {
    mockListRecurring.mockResolvedValue([netflix]);
    mockExists.mockResolvedValue(false);

    await ensureRecurringForMonth('2026-10');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        isPaid: true,
        dueDate: null,
        date: '2026-10-05',
      })
    );
  });

  it('przycina dzień 31 do długości krótszego miesiąca', async () => {
    mockListRecurring.mockResolvedValue([{ ...internet, dayOfMonth: 31 }]);
    mockExists.mockResolvedValue(false);

    await ensureRecurringForMonth('2026-11');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-11-30' })
    );
  });

  it('nie generuje pozycji dalej niż rok w przód', async () => {
    mockListRecurring.mockResolvedValue([internet]);
    mockExists.mockResolvedValue(false);

    const farFuture = `${Number(currentYearMonth().slice(0, 4)) + 3}-01`;
    const created = await ensureRecurringForMonth(farFuture);

    expect(created).toBe(0);
    expect(mockListRecurring).not.toHaveBeenCalled();
  });

  it('nie przerywa pracy, gdy zapis jednej pozycji się nie powiedzie', async () => {
    mockListRecurring.mockResolvedValue([internet, netflix]);
    mockExists.mockResolvedValue(false);
    mockCreate.mockRejectedValueOnce(new Error('UNIQUE constraint failed'));

    const created = await ensureRecurringForMonth('2026-12');

    expect(created).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
