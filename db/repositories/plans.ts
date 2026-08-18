/** Repozytorium planów miesięcznych (plan vs. rzeczywistość). */

import type { MonthlyPlan, YearMonth } from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface PlanRow {
  month: string;
  planned_income: number;
  planned_bills: number;
  planned_expenses: number;
  planned_savings: number;
  note: string | null;
}

function mapRow(row: PlanRow): MonthlyPlan {
  return {
    month: row.month,
    plannedIncome: row.planned_income,
    plannedBills: row.planned_bills,
    plannedExpenses: row.planned_expenses,
    plannedSavings: row.planned_savings,
    note: row.note,
  };
}

const SELECT =
  'SELECT month, planned_income, planned_bills, planned_expenses, planned_savings, note FROM monthly_plans';

export async function getPlan(month: YearMonth): Promise<MonthlyPlan | null> {
  const row = await queryFirst<PlanRow>(`${SELECT} WHERE month = ?`, [month]);
  return row ? mapRow(row) : null;
}

export interface PlanInput {
  plannedIncome: number;
  plannedBills: number;
  plannedExpenses: number;
  plannedSavings: number;
  note?: string | null;
}

export async function savePlan(month: YearMonth, input: PlanInput): Promise<void> {
  const timestamp = nowTimestamp();
  await run(
    `INSERT INTO monthly_plans
       (month, planned_income, planned_bills, planned_expenses, planned_savings, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       planned_income = excluded.planned_income,
       planned_bills = excluded.planned_bills,
       planned_expenses = excluded.planned_expenses,
       planned_savings = excluded.planned_savings,
       note = excluded.note,
       updated_at = excluded.updated_at`,
    [
      month,
      Math.max(0, Math.round(input.plannedIncome)),
      Math.max(0, Math.round(input.plannedBills)),
      Math.max(0, Math.round(input.plannedExpenses)),
      Math.max(0, Math.round(input.plannedSavings)),
      input.note?.trim() || null,
      timestamp,
      timestamp,
    ]
  );
}

export async function deletePlan(month: YearMonth): Promise<void> {
  await run('DELETE FROM monthly_plans WHERE month = ?', [month]);
}

export async function listPlans(): Promise<MonthlyPlan[]> {
  const rows = await query<PlanRow>(`${SELECT} ORDER BY month DESC`);
  return rows.map(mapRow);
}
