/** Repozytorium kategorii. */

import type { Category, TransactionType } from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface CategoryRow {
  id: number;
  name: string;
  kind: TransactionType;
  icon: string;
  color: string;
  sort_order: number;
  is_default: number;
  archived: number;
  is_demo: number;
}

function mapRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    isDefault: row.is_default === 1,
    archived: row.archived === 1,
    isDemo: row.is_demo === 1,
  };
}

const SELECT = `SELECT id, name, kind, icon, color, sort_order, is_default, archived, is_demo FROM categories`;

/** Wszystkie aktywne kategorie (opcjonalnie tylko wybranego typu). */
export async function listCategories(kind?: TransactionType): Promise<Category[]> {
  const rows = kind
    ? await query<CategoryRow>(
        `${SELECT} WHERE archived = 0 AND kind = ? ORDER BY sort_order, name COLLATE NOCASE`,
        [kind]
      )
    : await query<CategoryRow>(
        `${SELECT} WHERE archived = 0 ORDER BY kind, sort_order, name COLLATE NOCASE`
      );
  return rows.map(mapRow);
}

/** Wszystkie kategorie łącznie z zarchiwizowanymi (potrzebne np. w kopii zapasowej). */
export async function listAllCategories(): Promise<Category[]> {
  const rows = await query<CategoryRow>(`${SELECT} ORDER BY kind, sort_order, id`);
  return rows.map(mapRow);
}

export async function getCategory(id: number): Promise<Category | null> {
  const row = await queryFirst<CategoryRow>(`${SELECT} WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

/**
 * Kategorie wydatków posortowane według częstotliwości użycia w ostatnim czasie —
 * najczęściej używane trafiają na początek listy szybkiego dodawania.
 */
export async function listCategoriesByUsage(kind: TransactionType): Promise<Category[]> {
  const rows = await query<CategoryRow & { uses: number }>(
    `SELECT c.id, c.name, c.kind, c.icon, c.color, c.sort_order, c.is_default, c.archived, c.is_demo,
            COUNT(t.id) AS uses
     FROM categories c
     LEFT JOIN transactions t ON t.category_id = c.id AND t.type = c.kind
     WHERE c.archived = 0 AND c.kind = ?
     GROUP BY c.id
     ORDER BY uses DESC, c.sort_order, c.name COLLATE NOCASE`,
    [kind]
  );
  return rows.map(mapRow);
}

export interface CategoryInput {
  name: string;
  kind: TransactionType;
  icon: string;
  color: string;
  isDemo?: boolean;
}

export async function createCategory(input: CategoryInput): Promise<number> {
  const timestamp = nowTimestamp();
  const maxOrder = await queryFirst<{ value: number | null }>(
    'SELECT MAX(sort_order) AS value FROM categories WHERE kind = ?',
    [input.kind]
  );
  const result = await run(
    `INSERT INTO categories (name, kind, icon, color, sort_order, is_default, archived, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
    [
      input.name.trim(),
      input.kind,
      input.icon,
      input.color,
      (maxOrder?.value ?? 0) + 1,
      input.isDemo ? 1 : 0,
      timestamp,
      timestamp,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateCategory(
  id: number,
  input: Partial<Pick<CategoryInput, 'name' | 'icon' | 'color'>>
): Promise<void> {
  const current = await getCategory(id);
  if (!current) return;
  await run(
    `UPDATE categories SET name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ?`,
    [
      (input.name ?? current.name).trim(),
      input.icon ?? current.icon,
      input.color ?? current.color,
      nowTimestamp(),
      id,
    ]
  );
}

/**
 * Usuwa kategorię. Transakcje nie znikają — tracą jedynie przypisanie
 * (ON DELETE SET NULL), dzięki czemu historia kwot pozostaje nienaruszona.
 */
export async function deleteCategory(id: number): Promise<void> {
  await run('DELETE FROM categories WHERE id = ?', [id]);
}

/** Ile transakcji korzysta z kategorii — pokazywane w oknie potwierdzenia. */
export async function countCategoryUsage(id: number): Promise<number> {
  const row = await queryFirst<{ count: number }>(
    'SELECT COUNT(*) AS count FROM transactions WHERE category_id = ?',
    [id]
  );
  return row?.count ?? 0;
}

/** Znajduje kategorię po nazwie i typie (używane przy imporcie i danych demo). */
export async function findCategoryByName(
  name: string,
  kind: TransactionType
): Promise<Category | null> {
  const row = await queryFirst<CategoryRow>(
    `${SELECT} WHERE kind = ? AND name = ? COLLATE NOCASE LIMIT 1`,
    [kind, name]
  );
  return row ? mapRow(row) : null;
}
