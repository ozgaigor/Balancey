/**
 * Tryb demonstracyjny — przykładowy miesiąc gotowy do obejrzenia.
 * Wszystkie utworzone wpisy są oznaczone jako demo i dają się usunąć
 * jednym przyciskiem w Ustawieniach.
 */

import type { TransactionType } from '../types';
import { currentYearMonth, todayISO, toParts } from '../utils/dates';
import { run } from '../db/database';
import { findCategoryByName } from '../db/repositories/categories';
import { createRecurring } from '../db/repositories/recurring';
import { createGoal } from '../db/repositories/savings';
import { savePlan, deletePlan } from '../db/repositories/plans';
import { setCategoryBudget, setMonthBudget } from '../db/repositories/budgets';
import { rememberHint } from '../db/repositories/hints';
import {
  createTransaction,
  listByMonth,
  setBillPaid,
} from '../db/repositories/transactions';
import { getSetting, setSetting } from '../db/repositories/settings';
import { ensureRecurringForMonth } from './recurringService';

/** Nazwy używane w danych demo (potrzebne do ich pełnego usunięcia). */
const DEMO_NAMES = [
  'Pensja',
  'Dodatkowa praca',
  'Czynsz',
  'Internet',
  'Telefon',
  'Netflix',
  'Biedronka',
  'Lidl',
  'Żabka',
  'Restauracja',
  'Orlen',
  'Bilet miesięczny',
  'Rossmann',
  'Media Expert',
  'Kino',
  'Odłożone w tym miesiącu',
];

async function categoryId(name: string, kind: TransactionType): Promise<number | null> {
  const category = await findCategoryByName(name, kind);
  return category?.id ?? null;
}

/** Data w bieżącym miesiącu, nigdy w przyszłości. */
function demoDate(desiredDay: number): string {
  const month = currentYearMonth();
  const today = todayISO();
  const currentDay = toParts(today).day;
  const day = Math.min(desiredDay, currentDay);
  return `${month}-${String(Math.max(day, 1)).padStart(2, '0')}`;
}

/** Wgrywa przykładowy miesiąc. */
export async function loadDemoData(): Promise<void> {
  const month = currentYearMonth();

  // 1. Rachunki cykliczne — z nich powstają pozycje w kolejnych miesiącach.
  const rentCategory = await categoryId('Czynsz', 'bill');
  const internetCategory = await categoryId('Internet', 'bill');
  const phoneCategory = await categoryId('Telefon', 'bill');
  const funCategory = await categoryId('Rozrywka', 'expense');

  await createRecurring({
    type: 'bill',
    name: 'Czynsz',
    amount: 150000,
    categoryId: rentCategory,
    dayOfMonth: 1,
    startMonth: month,
    isDemo: true,
  });
  await createRecurring({
    type: 'bill',
    name: 'Internet',
    amount: 8000,
    categoryId: internetCategory,
    dayOfMonth: 10,
    startMonth: month,
    isDemo: true,
  });
  await createRecurring({
    type: 'bill',
    name: 'Telefon',
    amount: 5000,
    categoryId: phoneCategory,
    dayOfMonth: 15,
    startMonth: month,
    isDemo: true,
  });
  await createRecurring({
    type: 'expense',
    name: 'Netflix',
    amount: 4000,
    categoryId: funCategory,
    dayOfMonth: 5,
    startMonth: month,
    isDemo: true,
  });

  await ensureRecurringForMonth(month);

  // Czynsz i internet oznaczamy jako zapłacone, telefon zostaje "Do zapłaty".
  const generated = await listByMonth(month);
  for (const tx of generated) {
    if (tx.type === 'bill' && (tx.name === 'Czynsz' || tx.name === 'Internet')) {
      await setBillPaid(tx.id, true, tx.dueDate ?? tx.date);
    }
  }

  // 2. Przychody
  const salaryCategory = await categoryId('Pensja', 'income');
  const extraWorkCategory = await categoryId('Dodatkowa praca', 'income');

  await createTransaction({
    type: 'income',
    amount: 500000,
    categoryId: salaryCategory,
    name: 'Pensja',
    date: demoDate(10),
    isDemo: true,
  });
  await createTransaction({
    type: 'income',
    amount: 100000,
    categoryId: extraWorkCategory,
    name: 'Dodatkowa praca',
    date: demoDate(20),
    isDemo: true,
  });

  // 3. Wydatki
  const foodCategory = await categoryId('Jedzenie', 'expense');
  const transportCategory = await categoryId('Transport', 'expense');
  const shoppingCategory = await categoryId('Zakupy', 'expense');

  const expenses: {
    name: string;
    amount: number;
    category: number | null;
    day: number;
    method: 'card' | 'cash' | 'blik';
  }[] = [
    { name: 'Biedronka', amount: 24530, category: foodCategory, day: 3, method: 'card' },
    { name: 'Lidl', amount: 18970, category: foodCategory, day: 9, method: 'card' },
    { name: 'Żabka', amount: 6500, category: foodCategory, day: 14, method: 'blik' },
    { name: 'Restauracja', amount: 10000, category: foodCategory, day: 18, method: 'card' },
    { name: 'Orlen', amount: 20000, category: transportCategory, day: 6, method: 'card' },
    { name: 'Bilet miesięczny', amount: 5000, category: transportCategory, day: 2, method: 'blik' },
    { name: 'Rossmann', amount: 12000, category: shoppingCategory, day: 11, method: 'card' },
    { name: 'Media Expert', amount: 18000, category: shoppingCategory, day: 16, method: 'card' },
    { name: 'Kino', amount: 6000, category: funCategory, day: 21, method: 'cash' },
  ];

  for (const expense of expenses) {
    await createTransaction({
      type: 'expense',
      amount: expense.amount,
      categoryId: expense.category,
      name: expense.name,
      date: demoDate(expense.day),
      paymentMethod: expense.method,
      isDemo: true,
    });
    await rememberHint(expense.name, 'expense', expense.category, expense.amount);
  }

  // 4. Oszczędności wraz z celem
  const goalId = await createGoal({
    name: 'Nowy komputer',
    targetAmount: 600000,
    initialAmount: 190000,
    icon: 'laptop-outline',
    color: '#3FC7C0',
    isDemo: true,
  });
  const savingCategory = await categoryId('Oszczędności', 'saving');
  await createTransaction({
    type: 'saving',
    amount: 50000,
    categoryId: savingCategory,
    name: 'Odłożone w tym miesiącu',
    date: demoDate(12),
    goalId,
    isDemo: true,
  });

  // 5. Budżet miesiąca i limity kategorii (tylko dla miesiąca demo)
  await setMonthBudget(month, 300000);
  if (foodCategory) await setCategoryBudget(foodCategory, 100000, month);
  if (transportCategory) await setCategoryBudget(transportCategory, 40000, month);
  if (funCategory) await setCategoryBudget(funCategory, 30000, month);
  if (shoppingCategory) await setCategoryBudget(shoppingCategory, 50000, month);

  // 6. Plan miesiąca — do porównania "plan vs rzeczywistość"
  await savePlan(month, {
    plannedIncome: 600000,
    plannedBills: 163000,
    plannedExpenses: 250000,
    plannedSavings: 50000,
    note: 'Plan przykładowy (dane demo)',
  });

  await setSetting('demo_data_loaded', true);
  await setSetting('demo_month', month);
}

/** Usuwa wszystkie dane demonstracyjne, nie ruszając wpisów użytkownika. */
export async function removeDemoData(): Promise<void> {
  // Miesiąc zapisany przy wgrywaniu danych demo — dzięki temu usuwanie działa
  // poprawnie także wtedy, gdy od tamtej pory zmienił się miesiąc.
  const month = (await getSetting('demo_month')) ?? currentYearMonth();

  await run('DELETE FROM transactions WHERE is_demo = 1');
  await run('DELETE FROM recurring_transactions WHERE is_demo = 1');
  await run('DELETE FROM savings_goals WHERE is_demo = 1');
  await run('DELETE FROM budgets WHERE month = ?', [month]);
  await run('DELETE FROM budget_categories WHERE month = ?', [month]);
  await deletePlan(month);

  for (const name of DEMO_NAMES) {
    await run('DELETE FROM merchant_hints WHERE name_key = ?', [name.toLowerCase()]);
  }

  await setSetting('demo_data_loaded', false);
}
