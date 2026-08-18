/** Statystyki miesiąca i dane do wykresów. */

import type { TransactionWithCategory, YearMonth } from '../types';
import {
  averageDaily,
  dailyTotals,
  percentChange,
  summarize,
  type MonthSummary,
} from '../utils/calculations';
import { addMonths, daysElapsedInMonth, monthRange, todayISO } from '../utils/dates';
import { listBetweenMonths, listByMonth } from '../db/repositories/transactions';
import { getMonthOverview, type CategorySpending } from './budgetService';

export interface LargestExpense {
  name: string;
  amount: number;
  date: string;
  categoryName: string | null;
}

export interface MonthSeriesPoint {
  month: YearMonth;
  income: number;
  expenses: number;
}

export interface MonthStats {
  month: YearMonth;
  summary: MonthSummary;
  /** Kategorie wydatków malejąco (do wykresu i listy). */
  categories: CategorySpending[];
  largestExpense: LargestExpense | null;
  /** Średni dzienny wydatek w miesiącu. */
  averageDailyExpense: number;
  previousSummary: MonthSummary | null;
  /** Zmiana wydatków względem poprzedniego miesiąca, w procentach. */
  expensesChange: number | null;
  incomeChange: number | null;
  savingsChange: number | null;
  /** Sześć ostatnich miesięcy: przychody vs wydatki. */
  series: MonthSeriesPoint[];
  /** Wydatki dzień po dniu (wykres słupkowy w statystykach). */
  dailyExpenses: { date: string; total: number }[];
}

/** Komplet statystyk dla miesiąca. */
export async function getMonthStats(month: YearMonth): Promise<MonthStats> {
  const overview = await getMonthOverview(month);
  const previousMonth = addMonths(month, -1);
  const previousTransactions = await listByMonth(previousMonth);
  const previousSummary = previousTransactions.length > 0 ? summarize(previousTransactions) : null;

  // Największy wydatek bierzemy wprost z listy transakcji miesiąca,
  // dzięki czemu mamy od razu nazwę kategorii.
  const biggest = overview.transactions.reduce<TransactionWithCategory | null>((best, tx) => {
    if (tx.type !== 'expense') return best;
    return best == null || tx.amount > best.amount ? tx : best;
  }, null);

  const largestExpense: LargestExpense | null = biggest
    ? {
        name: biggest.name.trim() !== '' ? biggest.name : (biggest.categoryName ?? 'Wydatek'),
        amount: biggest.amount,
        date: biggest.date,
        categoryName: biggest.categoryName,
      }
    : null;

  const elapsedDays = daysElapsedInMonth(month, todayISO());

  return {
    month,
    summary: overview.summary,
    categories: overview.categorySpending,
    largestExpense,
    averageDailyExpense: averageDaily(overview.summary.expenses, Math.max(elapsedDays, 1)),
    previousSummary,
    expensesChange: previousSummary
      ? percentChange(overview.summary.expenses, previousSummary.expenses)
      : null,
    incomeChange: previousSummary
      ? percentChange(overview.summary.income, previousSummary.income)
      : null,
    savingsChange: previousSummary
      ? percentChange(overview.summary.savings, previousSummary.savings)
      : null,
    series: await getMonthlySeries(month, 6),
    dailyExpenses: dailyTotals(overview.transactions, 'expense'),
  };
}

/** Przychody i wydatki dla ostatnich N miesięcy (wykres słupkowy). */
export async function getMonthlySeries(
  endMonth: YearMonth,
  months = 6
): Promise<MonthSeriesPoint[]> {
  const startMonth = addMonths(endMonth, -(months - 1));
  const transactions = await listBetweenMonths(startMonth, endMonth);

  const buckets = new Map<string, { income: number; expenses: number }>();
  for (const month of monthRange(startMonth, endMonth)) {
    buckets.set(month, { income: 0, expenses: 0 });
  }

  for (const tx of transactions) {
    const bucket = buckets.get(tx.month);
    if (!bucket) continue;
    if (tx.type === 'income') bucket.income += tx.amount;
    else if (tx.type === 'expense') bucket.expenses += tx.amount;
    else if (tx.type === 'bill' && tx.isPaid) bucket.expenses += tx.amount;
  }

  return Array.from(buckets.entries()).map(([month, value]) => ({
    month,
    income: value.income,
    expenses: value.expenses,
  }));
}

/** Zdanie podsumowujące porównanie z poprzednim miesiącem. */
export function comparisonSentence(change: number | null): string | null {
  if (change == null) return null;
  if (change === 0) return 'Wydajesz tyle samo co w poprzednim miesiącu.';
  if (change < 0) return `Wydajesz o ${Math.abs(change)}% mniej niż w poprzednim miesiącu.`;
  return `Wydajesz o ${change}% więcej niż w poprzednim miesiącu.`;
}
