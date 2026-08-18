/** Repozytorium transakcji cyklicznych (rachunki i wydatki powtarzalne). */

import type { PaymentMethod, RecurringTransaction, TransactionType, YearMonth } from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface RecurringRow {
  id: number;
  type: TransactionType;
  name: string;
  amount: number;
  category_id: number | null;
  day_of_month: number;
  payment_method: PaymentMethod | null;
  note: string | null;
  auto_create: number;
  active: number;
  start_month: string;
  end_month: string | null;
  is_demo: number;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
}

export interface RecurringWithCategory extends RecurringTransaction {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

function mapRow(row: RecurringRow): RecurringWithCategory {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    amount: row.amount,
    categoryId: row.category_id,
    dayOfMonth: row.day_of_month,
    paymentMethod: row.payment_method,
    note: row.note,
    autoCreate: row.auto_create === 1,
    active: row.active === 1,
    startMonth: row.start_month,
    endMonth: row.end_month,
    isDemo: row.is_demo === 1,
    categoryName: row.category_name ?? null,
    categoryIcon: row.category_icon ?? null,
    categoryColor: row.category_color ?? null,
  };
}

const SELECT = `
  SELECT r.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM recurring_transactions r
  LEFT JOIN categories c ON c.id = r.category_id
`;

export interface RecurringInput {
  type: TransactionType;
  name: string;
  amount: number;
  categoryId: number | null;
  dayOfMonth: number;
  paymentMethod?: PaymentMethod | null;
  note?: string | null;
  autoCreate?: boolean;
  active?: boolean;
  startMonth: YearMonth;
  endMonth?: YearMonth | null;
  isDemo?: boolean;
}

export async function listRecurring(activeOnly = false): Promise<RecurringWithCategory[]> {
  const rows = await query<RecurringRow>(
    `${SELECT} ${activeOnly ? 'WHERE r.active = 1' : ''} ORDER BY r.type, r.day_of_month, r.name COLLATE NOCASE`
  );
  return rows.map(mapRow);
}

/** Cykle aktywne i mające zastosowanie w danym miesiącu. */
export async function listRecurringForMonth(month: YearMonth): Promise<RecurringWithCategory[]> {
  const rows = await query<RecurringRow>(
    `${SELECT}
     WHERE r.active = 1 AND r.auto_create = 1
       AND r.start_month <= ?
       AND (r.end_month IS NULL OR r.end_month >= ?)
     ORDER BY r.day_of_month`,
    [month, month]
  );
  return rows.map(mapRow);
}

export async function getRecurring(id: number): Promise<RecurringWithCategory | null> {
  const row = await queryFirst<RecurringRow>(`${SELECT} WHERE r.id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export async function createRecurring(input: RecurringInput): Promise<number> {
  const timestamp = nowTimestamp();
  const result = await run(
    `INSERT INTO recurring_transactions
       (type, name, amount, category_id, day_of_month, payment_method, note,
        auto_create, active, start_month, end_month, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.type,
      input.name.trim(),
      Math.abs(Math.round(input.amount)),
      input.categoryId,
      Math.min(Math.max(Math.round(input.dayOfMonth), 1), 31),
      input.paymentMethod ?? null,
      input.note?.trim() || null,
      input.autoCreate === false ? 0 : 1,
      input.active === false ? 0 : 1,
      input.startMonth,
      input.endMonth ?? null,
      input.isDemo ? 1 : 0,
      timestamp,
      timestamp,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateRecurring(id: number, input: RecurringInput): Promise<void> {
  await run(
    `UPDATE recurring_transactions SET
       type = ?, name = ?, amount = ?, category_id = ?, day_of_month = ?, payment_method = ?,
       note = ?, auto_create = ?, active = ?, start_month = ?, end_month = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.type,
      input.name.trim(),
      Math.abs(Math.round(input.amount)),
      input.categoryId,
      Math.min(Math.max(Math.round(input.dayOfMonth), 1), 31),
      input.paymentMethod ?? null,
      input.note?.trim() || null,
      input.autoCreate === false ? 0 : 1,
      input.active === false ? 0 : 1,
      input.startMonth,
      input.endMonth ?? null,
      nowTimestamp(),
      id,
    ]
  );
}

/** Włącza / wyłącza automatyczne tworzenie transakcji dla cyklu. */
export async function setRecurringActive(id: number, active: boolean): Promise<void> {
  await run('UPDATE recurring_transactions SET active = ?, updated_at = ? WHERE id = ?', [
    active ? 1 : 0,
    nowTimestamp(),
    id,
  ]);
}

/**
 * Usuwa cykl. Transakcje utworzone wcześniej pozostają w historii —
 * tracą tylko powiązanie z cyklem (ON DELETE SET NULL).
 */
export async function deleteRecurring(id: number): Promise<void> {
  await run('DELETE FROM recurring_transactions WHERE id = ?', [id]);
}

/** Ile transakcji zostało już utworzonych z danego cyklu. */
export async function countGenerated(id: number): Promise<number> {
  const row = await queryFirst<{ count: number }>(
    'SELECT COUNT(*) AS count FROM transactions WHERE recurring_id = ?',
    [id]
  );
  return row?.count ?? 0;
}
