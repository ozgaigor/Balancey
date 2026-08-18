/** Repozytorium budżetów: miesięcznego limitu wydatków i limitów kategorii. */

import type { YearMonth } from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';
import { getSetting, setSetting } from './settings';

interface BudgetRow {
  month: string;
  amount: number;
}

interface CategoryBudgetRow {
  id: number;
  month: string;
  category_id: number;
  amount: number;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

export interface EffectiveBudget {
  /** Limit w groszach (0 = brak limitu). */
  amount: number;
  /** Czy limit pochodzi z ustawienia domyślnego, a nie z konkretnego miesiąca. */
  fromDefault: boolean;
}

/** Limit ustawiony wprost dla miesiąca (null = brak wpisu). */
export async function getMonthBudget(month: YearMonth): Promise<number | null> {
  const row = await queryFirst<BudgetRow>('SELECT month, amount FROM budgets WHERE month = ?', [
    month,
  ]);
  return row ? row.amount : null;
}

/** Limit obowiązujący dla miesiąca — własny wpis lub wartość domyślna z ustawień. */
export async function getEffectiveBudget(month: YearMonth): Promise<EffectiveBudget> {
  const own = await getMonthBudget(month);
  if (own != null) return { amount: own, fromDefault: false };
  const fallback = Number.parseInt((await getSetting('default_budget')) ?? '0', 10);
  return { amount: Number.isFinite(fallback) ? fallback : 0, fromDefault: true };
}

/** Zapisuje limit dla miesiąca; opcjonalnie ustawia go też jako domyślny. */
export async function setMonthBudget(
  month: YearMonth,
  amount: number,
  alsoAsDefault = false
): Promise<void> {
  const timestamp = nowTimestamp();
  if (amount <= 0) {
    await run('DELETE FROM budgets WHERE month = ?', [month]);
  } else {
    await run(
      `INSERT INTO budgets (month, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
      [month, Math.round(amount), timestamp, timestamp]
    );
  }
  if (alsoAsDefault) {
    await setSetting('default_budget', Math.max(0, Math.round(amount)));
  }
}

export interface CategoryBudget {
  id: number;
  month: string;
  categoryId: number;
  amount: number;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

function mapCategoryBudget(row: CategoryBudgetRow): CategoryBudget {
  return {
    id: row.id,
    month: row.month,
    categoryId: row.category_id,
    amount: row.amount,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
  };
}

/**
 * Limity kategorii obowiązujące w danym miesiącu.
 * Limit przypisany do konkretnego miesiąca ma pierwszeństwo przed limitem
 * ogólnym (month = '*'), który obowiązuje w każdym miesiącu.
 */
export async function listCategoryBudgets(month: YearMonth): Promise<CategoryBudget[]> {
  const rows = await query<CategoryBudgetRow>(
    `SELECT b.id, b.month, b.category_id, b.amount,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM budget_categories b
     JOIN categories c ON c.id = b.category_id
     WHERE b.month IN ('*', ?)
     ORDER BY c.sort_order, c.name COLLATE NOCASE`,
    [month]
  );

  const byCategory = new Map<number, CategoryBudget>();
  for (const row of rows) {
    const mapped = mapCategoryBudget(row);
    const existing = byCategory.get(mapped.categoryId);
    if (!existing || mapped.month !== '*') {
      byCategory.set(mapped.categoryId, mapped);
    }
  }
  return Array.from(byCategory.values());
}

/** Ustawia limit kategorii. Domyślnie limit obowiązuje w każdym miesiącu. */
export async function setCategoryBudget(
  categoryId: number,
  amount: number,
  month: YearMonth | '*' = '*'
): Promise<void> {
  const timestamp = nowTimestamp();
  if (amount <= 0) {
    await run('DELETE FROM budget_categories WHERE category_id = ? AND month = ?', [
      categoryId,
      month,
    ]);
    return;
  }
  await run(
    `INSERT INTO budget_categories (month, category_id, amount, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(month, category_id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
    [month, categoryId, Math.round(amount), timestamp, timestamp]
  );
}

export async function deleteCategoryBudget(id: number): Promise<void> {
  await run('DELETE FROM budget_categories WHERE id = ?', [id]);
}

/** Wszystkie wpisy budżetów (eksport / kopia zapasowa). */
export async function listAllBudgets(): Promise<{ month: string; amount: number }[]> {
  return query<BudgetRow>('SELECT month, amount FROM budgets ORDER BY month');
}

export async function listAllCategoryBudgets(): Promise<
  { month: string; categoryId: number; amount: number }[]
> {
  const rows = await query<{ month: string; category_id: number; amount: number }>(
    'SELECT month, category_id, amount FROM budget_categories ORDER BY month, category_id'
  );
  return rows.map((row) => ({
    month: row.month,
    categoryId: row.category_id,
    amount: row.amount,
  }));
}
