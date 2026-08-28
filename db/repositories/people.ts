/** Repozytorium osób uczestniczących w podziale kosztów. */

import type { Person } from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface PersonRow {
  id: number;
  name: string;
  color: string;
  is_me: number;
  archived: number;
  is_demo: number;
}

function mapRow(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isMe: row.is_me === 1,
    archived: row.archived === 1,
    isDemo: row.is_demo === 1,
  };
}

const SELECT = `SELECT id, name, color, is_me, archived, is_demo FROM people`;

/** Kolory proponowane kolejnym dodawanym osobom. */
export const PERSON_COLORS = [
  '#7C9CF5',
  '#F5A524',
  '#B48CF2',
  '#3FC7C0',
  '#F27D9D',
  '#8FD14F',
  '#E0A458',
  '#5FB0F5',
] as const;

/** Aktywne osoby; właściciel telefonu zawsze pierwszy. */
export async function listPeople(): Promise<Person[]> {
  const rows = await query<PersonRow>(
    `${SELECT} WHERE archived = 0 ORDER BY is_me DESC, name COLLATE NOCASE`
  );
  return rows.map(mapRow);
}

/** Wszystkie osoby łącznie z ukrytymi — potrzebne przy odczycie starych paragonów. */
export async function listAllPeople(): Promise<Person[]> {
  const rows = await query<PersonRow>(`${SELECT} ORDER BY is_me DESC, id`);
  return rows.map(mapRow);
}

export async function getPerson(id: number): Promise<Person | null> {
  const row = await queryFirst<PersonRow>(`${SELECT} WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

/** Właściciel telefonu — punkt odniesienia dla wszystkich sald. */
export async function getMe(): Promise<Person | null> {
  const row = await queryFirst<PersonRow>(`${SELECT} WHERE is_me = 1 LIMIT 1`);
  return row ? mapRow(row) : null;
}

export interface PersonInput {
  name: string;
  color?: string;
  isDemo?: boolean;
}

export async function createPerson(input: PersonInput): Promise<number> {
  const timestamp = nowTimestamp();
  const used = await query<{ color: string }>('SELECT color FROM people');
  const taken = new Set(used.map((row) => row.color));
  const nextColor =
    input.color ?? PERSON_COLORS.find((color) => !taken.has(color)) ?? PERSON_COLORS[0];

  const result = await run(
    `INSERT INTO people (name, color, is_me, archived, is_demo, created_at, updated_at)
     VALUES (?, ?, 0, 0, ?, ?, ?)`,
    [input.name.trim(), nextColor, input.isDemo ? 1 : 0, timestamp, timestamp]
  );
  return result.lastInsertRowId;
}

export async function updatePerson(
  id: number,
  input: Partial<Pick<PersonInput, 'name' | 'color'>>
): Promise<void> {
  const current = await getPerson(id);
  if (!current) return;
  await run('UPDATE people SET name = ?, color = ?, updated_at = ? WHERE id = ?', [
    (input.name ?? current.name).trim(),
    input.color ?? current.color,
    nowTimestamp(),
    id,
  ]);
}

/**
 * Ukrywa osobę, zachowując jej historyczne udziały i rozliczenia.
 * Właściciela telefonu nie da się ukryć — bez niego salda tracą sens.
 */
export async function archivePerson(id: number): Promise<void> {
  await run('UPDATE people SET archived = 1, updated_at = ? WHERE id = ? AND is_me = 0', [
    nowTimestamp(),
    id,
  ]);
}

export async function restorePerson(id: number): Promise<void> {
  await run('UPDATE people SET archived = 0, updated_at = ? WHERE id = ?', [nowTimestamp(), id]);
}

/**
 * Usuwa osobę wraz z jej udziałami i rozliczeniami (kaskada w schemacie).
 * Kwoty pozycji pozostają nietknięte — znika tylko przypisanie do osoby.
 */
export async function deletePerson(id: number): Promise<void> {
  await run('DELETE FROM people WHERE id = ? AND is_me = 0', [id]);
}

/** Ile pozycji ma przypisaną tę osobę — pokazywane przed usunięciem. */
export async function countPersonUsage(id: number): Promise<number> {
  const row = await queryFirst<{ count: number }>(
    'SELECT COUNT(*) AS count FROM item_shares WHERE person_id = ?',
    [id]
  );
  return row?.count ?? 0;
}
