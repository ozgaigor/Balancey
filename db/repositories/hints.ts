/**
 * Repozytorium podpowiedzi ("smart defaults").
 *
 * Zapamiętujemy ostatnią kategorię i kwotę dla danej nazwy, np.
 * "Biedronka" -> Jedzenie. To celowo prosty mechanizm: zwykłe zapamiętywanie,
 * bez żadnej analizy po stronie serwera.
 */

import type { MerchantHint, TransactionType } from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run } from '../database';

interface HintRow {
  name_key: string;
  display_name: string;
  category_id: number | null;
  type: TransactionType;
  last_amount: number | null;
  uses: number;
  updated_at: string;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
}

export interface HintWithCategory extends MerchantHint {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

function mapRow(row: HintRow): HintWithCategory {
  return {
    nameKey: row.name_key,
    displayName: row.display_name,
    categoryId: row.category_id,
    type: row.type,
    lastAmount: row.last_amount,
    uses: row.uses,
    updatedAt: row.updated_at,
    categoryName: row.category_name ?? null,
    categoryIcon: row.category_icon ?? null,
    categoryColor: row.category_color ?? null,
  };
}

/** Klucz porównania nazw — bez wielkości liter i zbędnych spacji. */
export function hintKey(name: string): string {
  return name.trim().toLowerCase();
}

const SELECT = `
  SELECT h.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
  FROM merchant_hints h
  LEFT JOIN categories c ON c.id = h.category_id
`;

/** Zapamiętuje powiązanie nazwa -> kategoria (wywoływane po zapisaniu transakcji). */
export async function rememberHint(
  name: string,
  type: TransactionType,
  categoryId: number | null,
  amount: number
): Promise<void> {
  const key = hintKey(name);
  if (key === '') return;
  await run(
    `INSERT INTO merchant_hints (name_key, display_name, category_id, type, last_amount, uses, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(name_key) DO UPDATE SET
       display_name = excluded.display_name,
       category_id = excluded.category_id,
       type = excluded.type,
       last_amount = excluded.last_amount,
       uses = merchant_hints.uses + 1,
       updated_at = excluded.updated_at`,
    [key, name.trim(), categoryId, type, Math.abs(Math.round(amount)), nowTimestamp()]
  );
}

/** Podpowiedź dla dokładnie wpisanej nazwy. */
export async function findHint(name: string): Promise<HintWithCategory | null> {
  const key = hintKey(name);
  if (key === '') return null;
  const row = await queryFirst<HintRow>(`${SELECT} WHERE h.name_key = ?`, [key]);
  return row ? mapRow(row) : null;
}

/** Podpowiedzi pasujące do początku wpisywanego tekstu. */
export async function suggestHints(prefix: string, limit = 5): Promise<HintWithCategory[]> {
  const key = hintKey(prefix);
  if (key === '') return [];
  const rows = await query<HintRow>(
    `${SELECT} WHERE h.name_key LIKE ? ORDER BY h.uses DESC, h.updated_at DESC LIMIT ?`,
    [`${key}%`, limit]
  );
  return rows.map(mapRow);
}

/** Najczęściej używane wpisy — lista "Ostatnie" do szybkiego powtarzania. */
export async function listFrequent(
  type: TransactionType | null = null,
  limit = 8
): Promise<HintWithCategory[]> {
  const rows = type
    ? await query<HintRow>(
        `${SELECT} WHERE h.type = ? ORDER BY h.uses DESC, h.updated_at DESC LIMIT ?`,
        [type, limit]
      )
    : await query<HintRow>(`${SELECT} ORDER BY h.uses DESC, h.updated_at DESC LIMIT ?`, [limit]);
  return rows.map(mapRow);
}

export async function deleteHint(nameKey: string): Promise<void> {
  await run('DELETE FROM merchant_hints WHERE name_key = ?', [nameKey]);
}

export async function listAllHints(): Promise<MerchantHint[]> {
  const rows = await query<HintRow>('SELECT * FROM merchant_hints ORDER BY uses DESC');
  return rows.map(mapRow);
}
