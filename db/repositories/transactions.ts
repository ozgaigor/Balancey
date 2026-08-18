/** Repozytorium transakcji — przychodów, rachunków, wydatków i oszczędności. */

import type { SQLiteBindParams } from 'expo-sqlite';

import type {
  ISODate,
  PaymentMethod,
  Transaction,
  TransactionType,
  TransactionWithCategory,
  YearMonth,
} from '../../types';
import { nowTimestamp, yearMonthOf } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface TransactionRow {
  id: number;
  type: TransactionType;
  amount: number;
  category_id: number | null;
  name: string;
  description: string | null;
  date: string;
  month: string;
  payment_method: PaymentMethod | null;
  is_paid: number;
  due_date: string | null;
  paid_date: string | null;
  goal_id: number | null;
  recurring_id: number | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
}

function mapRow(row: TransactionRow): TransactionWithCategory {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    date: row.date,
    month: row.month,
    paymentMethod: row.payment_method,
    isPaid: row.is_paid === 1,
    dueDate: row.due_date,
    paidDate: row.paid_date,
    goalId: row.goal_id,
    recurringId: row.recurring_id,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryName: row.category_name ?? null,
    categoryIcon: row.category_icon ?? null,
    categoryColor: row.category_color ?? null,
  };
}

const SELECT_WITH_CATEGORY = `
  SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

/** Kolejność listy: najnowsze daty na górze, w obrębie dnia najnowszy wpis. */
const ORDER = 'ORDER BY t.date DESC, t.id DESC';

export interface TransactionInput {
  type: TransactionType;
  /** Kwota w groszach (zawsze dodatnia). */
  amount: number;
  categoryId: number | null;
  name: string;
  description?: string | null;
  date: ISODate;
  paymentMethod?: PaymentMethod | null;
  isPaid?: boolean;
  dueDate?: ISODate | null;
  paidDate?: ISODate | null;
  goalId?: number | null;
  recurringId?: number | null;
  isDemo?: boolean;
}

export async function createTransaction(input: TransactionInput): Promise<number> {
  const timestamp = nowTimestamp();
  const amount = Math.abs(Math.round(input.amount));
  const isPaid = input.type === 'bill' ? (input.isPaid ?? false) : true;

  const result = await run(
    `INSERT INTO transactions
       (type, amount, category_id, name, description, date, month, payment_method,
        is_paid, due_date, paid_date, goal_id, recurring_id, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.type,
      amount,
      input.categoryId,
      input.name.trim(),
      input.description?.trim() || null,
      input.date,
      yearMonthOf(input.date),
      input.paymentMethod ?? null,
      isPaid ? 1 : 0,
      input.dueDate ?? null,
      input.paidDate ?? (isPaid && input.type === 'bill' ? input.date : null),
      input.goalId ?? null,
      input.recurringId ?? null,
      input.isDemo ? 1 : 0,
      timestamp,
      timestamp,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateTransaction(id: number, input: TransactionInput): Promise<void> {
  const amount = Math.abs(Math.round(input.amount));
  const isPaid = input.type === 'bill' ? (input.isPaid ?? false) : true;

  await run(
    `UPDATE transactions SET
       type = ?, amount = ?, category_id = ?, name = ?, description = ?, date = ?, month = ?,
       payment_method = ?, is_paid = ?, due_date = ?, paid_date = ?, goal_id = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.type,
      amount,
      input.categoryId,
      input.name.trim(),
      input.description?.trim() || null,
      input.date,
      yearMonthOf(input.date),
      input.paymentMethod ?? null,
      isPaid ? 1 : 0,
      input.dueDate ?? null,
      input.paidDate ?? null,
      input.goalId ?? null,
      nowTimestamp(),
      id,
    ]
  );
}

export async function deleteTransaction(id: number): Promise<void> {
  await run('DELETE FROM transactions WHERE id = ?', [id]);
}

export async function getTransaction(id: number): Promise<TransactionWithCategory | null> {
  const row = await queryFirst<TransactionRow>(`${SELECT_WITH_CATEGORY} WHERE t.id = ?`, [id]);
  return row ? mapRow(row) : null;
}

/** Wszystkie transakcje danego miesiąca. */
export async function listByMonth(month: YearMonth): Promise<TransactionWithCategory[]> {
  const rows = await query<TransactionRow>(
    `${SELECT_WITH_CATEGORY} WHERE t.month = ? ${ORDER}`,
    [month]
  );
  return rows.map(mapRow);
}

/** Transakcje z konkretnego dnia (widok dnia). */
export async function listByDate(date: ISODate): Promise<TransactionWithCategory[]> {
  const rows = await query<TransactionRow>(
    `${SELECT_WITH_CATEGORY} WHERE t.date = ? ORDER BY t.id DESC`,
    [date]
  );
  return rows.map(mapRow);
}

/** Ostatnie transakcje (ekran Start). */
export async function listRecent(limit = 5): Promise<TransactionWithCategory[]> {
  const rows = await query<TransactionRow>(
    `${SELECT_WITH_CATEGORY} ${ORDER} LIMIT ?`,
    [limit]
  );
  return rows.map(mapRow);
}

export interface TransactionFilters {
  month?: YearMonth | null;
  type?: TransactionType | null;
  categoryId?: number | null;
  search?: string | null;
  goalId?: number | null;
  limit?: number;
}

/** Lista transakcji z filtrami ekranu "Transakcje". */
export async function listTransactions(
  filters: TransactionFilters = {}
): Promise<TransactionWithCategory[]> {
  const conditions: string[] = [];
  const params: SQLiteBindParams = [];

  if (filters.month) {
    conditions.push('t.month = ?');
    params.push(filters.month);
  }
  if (filters.type) {
    conditions.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters.categoryId != null) {
    conditions.push('t.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.goalId != null) {
    conditions.push('t.goal_id = ?');
    params.push(filters.goalId);
  }
  if (filters.search && filters.search.trim() !== '') {
    conditions.push('(t.name LIKE ? OR t.description LIKE ? OR c.name LIKE ?)');
    const like = `%${filters.search.trim()}%`;
    params.push(like, like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ? ` LIMIT ${Math.max(1, Math.floor(filters.limit))}` : '';

  const rows = await query<TransactionRow>(
    `${SELECT_WITH_CATEGORY} ${where} ${ORDER}${limit}`,
    params
  );
  return rows.map(mapRow);
}

/** Transakcje z zakresu miesięcy (wykresy, porównania). */
export async function listBetweenMonths(
  fromMonth: YearMonth,
  toMonth: YearMonth
): Promise<TransactionWithCategory[]> {
  const rows = await query<TransactionRow>(
    `${SELECT_WITH_CATEGORY} WHERE t.month >= ? AND t.month <= ? ${ORDER}`,
    [fromMonth, toMonth]
  );
  return rows.map(mapRow);
}

/** Rachunki danego miesiąca (opłacone i nieopłacone). */
export async function listBills(month: YearMonth): Promise<TransactionWithCategory[]> {
  const rows = await query<TransactionRow>(
    `${SELECT_WITH_CATEGORY} WHERE t.month = ? AND t.type = 'bill'
     ORDER BY t.is_paid ASC, COALESCE(t.due_date, t.date) ASC, t.id ASC`,
    [month]
  );
  return rows.map(mapRow);
}

/** Nieopłacone rachunki z terminem w zadanym zakresie dat (powiadomienia). */
export async function listUnpaidBillsBetween(
  from: ISODate,
  to: ISODate
): Promise<TransactionWithCategory[]> {
  const rows = await query<TransactionRow>(
    `${SELECT_WITH_CATEGORY}
     WHERE t.type = 'bill' AND t.is_paid = 0
       AND COALESCE(t.due_date, t.date) >= ? AND COALESCE(t.due_date, t.date) <= ?
     ORDER BY COALESCE(t.due_date, t.date) ASC`,
    [from, to]
  );
  return rows.map(mapRow);
}

/** Oznacza rachunek jako zapłacony lub cofa opłacenie. */
export async function setBillPaid(id: number, paid: boolean, paidDate: ISODate): Promise<void> {
  await run(
    `UPDATE transactions SET is_paid = ?, paid_date = ?, updated_at = ? WHERE id = ? AND type = 'bill'`,
    [paid ? 1 : 0, paid ? paidDate : null, nowTimestamp(), id]
  );
}

/** Duplikuje transakcję (kopia z dzisiejszą datą). */
export async function duplicateTransaction(id: number, date: ISODate): Promise<number | null> {
  const source = await getTransaction(id);
  if (!source) return null;
  return createTransaction({
    type: source.type,
    amount: source.amount,
    categoryId: source.categoryId,
    name: source.name,
    description: source.description,
    date,
    paymentMethod: source.paymentMethod,
    isPaid: source.type === 'bill' ? false : true,
    dueDate: source.type === 'bill' ? date : null,
    goalId: source.goalId,
  });
}

/** Czy transakcja dla danego cyklu i miesiąca już istnieje. */
export async function existsForRecurring(
  recurringId: number,
  month: YearMonth
): Promise<boolean> {
  const row = await queryFirst<{ id: number }>(
    'SELECT id FROM transactions WHERE recurring_id = ? AND month = ? LIMIT 1',
    [recurringId, month]
  );
  return row != null;
}

/** Miesiące, w których istnieją jakiekolwiek dane (ekran Historia). */
export async function listMonthsWithData(): Promise<YearMonth[]> {
  const rows = await query<{ month: string }>(
    'SELECT DISTINCT month FROM transactions ORDER BY month DESC'
  );
  return rows.map((row) => row.month);
}

/** Suma zaoszczędzona na cel (transakcje typu "saving" przypisane do celu). */
export async function sumSavingsForGoal(goalId: number): Promise<number> {
  const row = await queryFirst<{ total: number | null }>(
    `SELECT SUM(amount) AS total FROM transactions WHERE goal_id = ? AND type = 'saving'`,
    [goalId]
  );
  return row?.total ?? 0;
}

/** Liczba wszystkich transakcji (ustawienia, kopia zapasowa). */
export async function countTransactions(): Promise<number> {
  const row = await queryFirst<{ count: number }>('SELECT COUNT(*) AS count FROM transactions');
  return row?.count ?? 0;
}

/** Wszystkie transakcje bez łączenia z kategoriami (eksport danych). */
export async function listAllRaw(): Promise<Transaction[]> {
  const rows = await query<TransactionRow>('SELECT * FROM transactions ORDER BY id');
  return rows.map(mapRow);
}
