/**
 * Logika budżetu miesięcznego: podsumowanie, limity, limity kategorii,
 * sugerowany limit dzienny. Cała matematyka pochodzi z utils/calculations.
 */

import type { TransactionWithCategory, YearMonth } from '../types';
import {
  budgetUsedPercent,
  budgetRemaining,
  progressPercent,
  shareOfTotal,
  suggestedDailyLimit,
  sumByCategory,
  summarize,
  type MonthSummary,
} from '../utils/calculations';
import { daysLeftInMonth, todayISO } from '../utils/dates';
import { getEffectiveBudget, listCategoryBudgets } from '../db/repositories/budgets';
import { listByMonth, listMonthsWithData } from '../db/repositories/transactions';
import { ensureRecurringForMonth } from './recurringService';

export interface BudgetStatus {
  /** Limit miesięczny w groszach (0 = nie ustawiono). */
  limit: number;
  /** Czy limit pochodzi z ustawienia domyślnego. */
  fromDefault: boolean;
  /** Wydano (tylko wydatki — rachunki i oszczędności liczone są osobno). */
  spent: number;
  /** Ile zostało z limitu (może być ujemne). */
  left: number;
  /** Procent wykorzystania (może przekroczyć 100). */
  percent: number;
  /** Procent przycięty do paska postępu. */
  barPercent: number;
  exceeded: boolean;
  hasLimit: boolean;
}

export interface CategorySpending {
  categoryId: number | null;
  name: string;
  icon: string;
  color: string;
  total: number;
  /** Udział w wydatkach miesiąca, w procentach. */
  share: number;
}

export interface CategoryBudgetStatus extends CategorySpending {
  limit: number;
  percent: number;
  barPercent: number;
  exceeded: boolean;
}

export interface MonthOverview {
  month: YearMonth;
  summary: MonthSummary;
  transactions: TransactionWithCategory[];
  budget: BudgetStatus;
  categorySpending: CategorySpending[];
  categoryBudgets: CategoryBudgetStatus[];
  unpaidBills: TransactionWithCategory[];
  daysLeft: number;
  /** Sugerowana kwota na dzień do końca miesiąca. */
  dailyLimit: number;
}

const UNCATEGORIZED: Pick<CategorySpending, 'name' | 'icon' | 'color'> = {
  name: 'Bez kategorii',
  icon: 'help-circle-outline',
  color: '#93A1B0',
};

/** Buduje komplet danych potrzebnych ekranom Start, Budżet i Historia. */
export async function getMonthOverview(month: YearMonth): Promise<MonthOverview> {
  // Rachunki i wydatki cykliczne są dopisywane przed policzeniem salda.
  await ensureRecurringForMonth(month);

  const [transactions, effectiveBudget, categoryLimits] = await Promise.all([
    listByMonth(month),
    getEffectiveBudget(month),
    listCategoryBudgets(month),
  ]);

  const summary = summarize(transactions);
  const spent = summary.expenses;
  const limit = effectiveBudget.amount;

  const budget: BudgetStatus = {
    limit,
    fromDefault: effectiveBudget.fromDefault,
    spent,
    left: budgetRemaining(spent, limit),
    percent: budgetUsedPercent(spent, limit),
    barPercent: progressPercent(spent, limit),
    exceeded: limit > 0 && spent > limit,
    hasLimit: limit > 0,
  };

  const totals = sumByCategory(transactions, 'expense');
  const categoryMeta = new Map<number | null, { name: string; icon: string; color: string }>();
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (!categoryMeta.has(tx.categoryId)) {
      categoryMeta.set(tx.categoryId, {
        name: tx.categoryName ?? UNCATEGORIZED.name,
        icon: tx.categoryIcon ?? UNCATEGORIZED.icon,
        color: tx.categoryColor ?? UNCATEGORIZED.color,
      });
    }
  }

  const categorySpending: CategorySpending[] = totals.map((item) => {
    const meta = categoryMeta.get(item.categoryId) ?? UNCATEGORIZED;
    return {
      categoryId: item.categoryId,
      name: meta.name,
      icon: meta.icon,
      color: meta.color,
      total: item.total,
      share: shareOfTotal(item.total, summary.expenses),
    };
  });

  const spentByCategory = new Map<number | null, number>(
    totals.map((item) => [item.categoryId, item.total])
  );

  const categoryBudgets: CategoryBudgetStatus[] = categoryLimits.map((limitRow) => {
    const categorySpent = spentByCategory.get(limitRow.categoryId) ?? 0;
    return {
      categoryId: limitRow.categoryId,
      name: limitRow.categoryName ?? UNCATEGORIZED.name,
      icon: limitRow.categoryIcon ?? UNCATEGORIZED.icon,
      color: limitRow.categoryColor ?? UNCATEGORIZED.color,
      total: categorySpent,
      share: shareOfTotal(categorySpent, summary.expenses),
      limit: limitRow.amount,
      percent: budgetUsedPercent(categorySpent, limitRow.amount),
      barPercent: progressPercent(categorySpent, limitRow.amount),
      exceeded: categorySpent > limitRow.amount,
    };
  });

  const daysLeft = daysLeftInMonth(month, todayISO());

  return {
    month,
    summary,
    transactions,
    budget,
    categorySpending,
    categoryBudgets,
    unpaidBills: transactions.filter((tx) => tx.type === 'bill' && !tx.isPaid),
    daysLeft,
    dailyLimit: budget.hasLimit
      ? suggestedDailyLimit(budget.left, daysLeft)
      : suggestedDailyLimit(summary.remaining, daysLeft),
  };
}

export interface MonthHistoryEntry {
  month: YearMonth;
  summary: MonthSummary;
}

/** Podsumowania kolejnych miesięcy — ekran Historia. */
export async function getHistory(limit = 24): Promise<MonthHistoryEntry[]> {
  const months = await listMonthsWithData();
  const selected = months.slice(0, limit);
  const entries: MonthHistoryEntry[] = [];

  for (const month of selected) {
    const transactions = await listByMonth(month);
    entries.push({ month, summary: summarize(transactions) });
  }

  return entries;
}

/** Samo podsumowanie miesiąca (bez ładowania limitów). */
export async function getMonthSummary(month: YearMonth): Promise<MonthSummary> {
  const transactions = await listByMonth(month);
  return summarize(transactions);
}
