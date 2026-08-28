/**
 * Repozytorium rozliczeń — zapisów typu "Kasia oddała mi 50 zł".
 *
 * Rozliczenie nie jest transakcją budżetową: pieniądze wracają do portfela,
 * ale wydatek został już zaksięgowany przy zakupie. Dlatego rozliczenia
 * żyją w osobnej tabeli i wpływają wyłącznie na saldo z daną osobą.
 */

import type { ISODate, Settlement } from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface SettlementRow {
  id: number;
  person_id: number;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

function mapRow(row: SettlementRow): Settlement {
  return {
    id: row.id,
    personId: row.person_id,
    amount: row.amount,
    date: row.date,
    note: row.note,
    createdAt: row.created_at,
  };
}

const SELECT = `SELECT id, person_id, amount, date, note, created_at FROM settlements`;

export interface SettlementInput {
  personId: number;
  /** Dodatnia — osoba oddała mi pieniądze. Ujemna — ja oddałem osobie. */
  amount: number;
  date: ISODate;
  note?: string | null;
}

export async function createSettlement(input: SettlementInput): Promise<number> {
  const result = await run(
    `INSERT INTO settlements (person_id, amount, date, note, is_demo, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [
      input.personId,
      Math.round(input.amount),
      input.date,
      input.note?.trim() || null,
      nowTimestamp(),
    ]
  );
  return result.lastInsertRowId;
}

/** Historia rozliczeń z jedną osobą, od najnowszych. */
export async function listSettlements(personId: number): Promise<Settlement[]> {
  const rows = await query<SettlementRow>(
    `${SELECT} WHERE person_id = ? ORDER BY date DESC, id DESC`,
    [personId]
  );
  return rows.map(mapRow);
}

/** Wszystkie rozliczenia — używane w kopii zapasowej i statystykach. */
export async function listAllSettlements(): Promise<Settlement[]> {
  const rows = await query<SettlementRow>(`${SELECT} ORDER BY date DESC, id DESC`);
  return rows.map(mapRow);
}

export async function deleteSettlement(id: number): Promise<void> {
  await run('DELETE FROM settlements WHERE id = ?', [id]);
}

/** Suma rozliczeń w rozbiciu na osoby — składnik salda. */
export async function sumSettlementsByPerson(): Promise<{ person_id: number; total: number }[]> {
  return query<{ person_id: number; total: number }>(
    'SELECT person_id, COALESCE(SUM(amount), 0) AS total FROM settlements GROUP BY person_id'
  );
}

export async function getSettlement(id: number): Promise<Settlement | null> {
  const row = await queryFirst<SettlementRow>(`${SELECT} WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}
