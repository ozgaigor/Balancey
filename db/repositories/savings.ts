/** Repozytorium celów oszczędnościowych. */

import type { SavingsGoal, SavingsGoalWithProgress } from '../../types';
import { goalPercent } from '../../utils/calculations';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface GoalRow {
  id: number;
  name: string;
  target_amount: number;
  initial_amount: number;
  icon: string;
  color: string;
  archived: number;
  is_demo: number;
  saved?: number | null;
}

function mapRow(row: GoalRow): SavingsGoalWithProgress {
  const saved = (row.initial_amount ?? 0) + (row.saved ?? 0);
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.target_amount,
    initialAmount: row.initial_amount,
    icon: row.icon,
    color: row.color,
    archived: row.archived === 1,
    isDemo: row.is_demo === 1,
    savedAmount: saved,
    percent: goalPercent(saved, row.target_amount),
  };
}

const SELECT_WITH_PROGRESS = `
  SELECT g.*, (
    SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
    WHERE t.goal_id = g.id AND t.type = 'saving'
  ) AS saved
  FROM savings_goals g
`;

/** Cele wraz z aktualnym postępem. */
export async function listGoals(includeArchived = false): Promise<SavingsGoalWithProgress[]> {
  const rows = await query<GoalRow>(
    `${SELECT_WITH_PROGRESS} ${includeArchived ? '' : 'WHERE g.archived = 0'} ORDER BY g.archived, g.id`
  );
  return rows.map(mapRow);
}

export async function getGoal(id: number): Promise<SavingsGoalWithProgress | null> {
  const row = await queryFirst<GoalRow>(`${SELECT_WITH_PROGRESS} WHERE g.id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export interface GoalInput {
  name: string;
  targetAmount: number;
  initialAmount?: number;
  icon?: string;
  color?: string;
  isDemo?: boolean;
}

export async function createGoal(input: GoalInput): Promise<number> {
  const timestamp = nowTimestamp();
  const result = await run(
    `INSERT INTO savings_goals (name, target_amount, initial_amount, icon, color, archived, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      input.name.trim(),
      Math.abs(Math.round(input.targetAmount)),
      Math.abs(Math.round(input.initialAmount ?? 0)),
      input.icon ?? 'flag-outline',
      input.color ?? '#3FC7C0',
      input.isDemo ? 1 : 0,
      timestamp,
      timestamp,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateGoal(id: number, input: GoalInput): Promise<void> {
  const current = await getGoal(id);
  if (!current) return;
  await run(
    `UPDATE savings_goals SET name = ?, target_amount = ?, initial_amount = ?, icon = ?, color = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name.trim(),
      Math.abs(Math.round(input.targetAmount)),
      Math.abs(Math.round(input.initialAmount ?? current.initialAmount)),
      input.icon ?? current.icon,
      input.color ?? current.color,
      nowTimestamp(),
      id,
    ]
  );
}

export async function setGoalArchived(id: number, archived: boolean): Promise<void> {
  await run('UPDATE savings_goals SET archived = ?, updated_at = ? WHERE id = ?', [
    archived ? 1 : 0,
    nowTimestamp(),
    id,
  ]);
}

/** Usuwa cel; wpłaty pozostają jako oszczędności bez przypisania do celu. */
export async function deleteGoal(id: number): Promise<void> {
  await run('DELETE FROM savings_goals WHERE id = ?', [id]);
}

/** Surowa lista celów do kopii zapasowej. */
export async function listGoalsRaw(): Promise<SavingsGoal[]> {
  const rows = await query<GoalRow>('SELECT * FROM savings_goals ORDER BY id');
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    targetAmount: row.target_amount,
    initialAmount: row.initial_amount,
    icon: row.icon,
    color: row.color,
    archived: row.archived === 1,
    isDemo: row.is_demo === 1,
  }));
}
