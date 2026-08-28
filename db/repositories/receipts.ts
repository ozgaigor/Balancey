/**
 * Repozytorium paragonów: nagłówek, pozycje i przypisania osób.
 *
 * Paragon zawsze należy do jednej transakcji typu "wydatek". Usunięcie
 * transakcji kasuje paragon (ON DELETE CASCADE), więc historia budżetu
 * i szczegóły zakupów nigdy się nie rozjeżdżają.
 */

import type {
  ISODate,
  ItemShare,
  Receipt,
  ReceiptItemWithShares,
  ReceiptSource,
  ReceiptWithItems,
  YearMonth,
} from '../../types';
import { nowTimestamp } from '../../utils/dates';
import { query, queryFirst, run, withTransaction } from '../database';

interface ReceiptRow {
  id: number;
  transaction_id: number | null;
  merchant: string;
  date: string;
  total: number;
  payer_id: number | null;
  source: ReceiptSource;
  raw_text: string | null;
  image_uri: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: number;
  receipt_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  category_id: number | null;
  sort_order: number;
  category_name: string | null;
  category_color: string | null;
}

interface ShareRow {
  id: number;
  item_id: number;
  person_id: number;
  amount: number;
}

function mapReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    merchant: row.merchant,
    date: row.date,
    total: row.total,
    payerId: row.payer_id,
    source: row.source,
    rawText: row.raw_text,
    imageUri: row.image_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_RECEIPT = `
  SELECT id, transaction_id, merchant, date, total, payer_id, source,
         raw_text, image_uri, created_at, updated_at
  FROM receipts
`;

const SELECT_ITEMS = `
  SELECT i.id, i.receipt_id, i.name, i.quantity, i.unit_price, i.total,
         i.category_id, i.sort_order,
         c.name AS category_name, c.color AS category_color
  FROM receipt_items i
  LEFT JOIN categories c ON c.id = i.category_id
  WHERE i.receipt_id = ?
  ORDER BY i.sort_order, i.id
`;

/** Pozycja przygotowana do zapisu — bez identyfikatorów nadawanych przez bazę. */
export interface ReceiptItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  categoryId: number | null;
  /** Udziały osób; pusta lista = koszt wspólny, poza podziałem. */
  shares: { personId: number; amount: number }[];
}

export interface ReceiptInput {
  transactionId: number | null;
  merchant: string;
  date: ISODate;
  total: number;
  payerId: number | null;
  source: ReceiptSource;
  rawText?: string | null;
  imageUri?: string | null;
  items: ReceiptItemInput[];
}

/**
 * Zapisuje paragon wraz z pozycjami i udziałami w jednej transakcji bazy —
 * albo zapisuje się wszystko, albo nic.
 */
export async function createReceipt(input: ReceiptInput): Promise<number> {
  const timestamp = nowTimestamp();
  let receiptId = 0;

  await withTransaction(async () => {
    const result = await run(
      `INSERT INTO receipts
         (transaction_id, merchant, date, total, payer_id, source, raw_text, image_uri,
          is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        input.transactionId,
        input.merchant.trim(),
        input.date,
        Math.round(input.total),
        input.payerId,
        input.source,
        input.rawText ?? null,
        input.imageUri ?? null,
        timestamp,
        timestamp,
      ]
    );
    receiptId = result.lastInsertRowId;

    for (let index = 0; index < input.items.length; index += 1) {
      await insertItem(receiptId, input.items[index], index, timestamp);
    }
  });

  return receiptId;
}

async function insertItem(
  receiptId: number,
  item: ReceiptItemInput,
  sortOrder: number,
  timestamp: string
): Promise<number> {
  const result = await run(
    `INSERT INTO receipt_items
       (receipt_id, name, quantity, unit_price, total, category_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      receiptId,
      item.name.trim(),
      Math.round(item.quantity),
      Math.round(item.unitPrice),
      Math.round(item.total),
      item.categoryId,
      sortOrder,
      timestamp,
      timestamp,
    ]
  );

  const itemId = result.lastInsertRowId;

  for (const share of item.shares) {
    if (share.amount === 0) continue;
    await run('INSERT INTO item_shares (item_id, person_id, amount) VALUES (?, ?, ?)', [
      itemId,
      share.personId,
      Math.round(share.amount),
    ]);
  }

  return itemId;
}

/** Paragon z pozycjami i udziałami — komplet danych ekranu podziału. */
export async function getReceipt(id: number): Promise<ReceiptWithItems | null> {
  const row = await queryFirst<ReceiptRow>(`${SELECT_RECEIPT} WHERE id = ?`, [id]);
  if (!row) return null;

  const itemRows = await query<ItemRow>(SELECT_ITEMS, [id]);
  const shareRows = await query<ShareRow>(
    `SELECT s.id, s.item_id, s.person_id, s.amount
     FROM item_shares s
     JOIN receipt_items i ON i.id = s.item_id
     WHERE i.receipt_id = ?`,
    [id]
  );

  const sharesByItem = new Map<number, ItemShare[]>();
  for (const share of shareRows) {
    const list = sharesByItem.get(share.item_id) ?? [];
    list.push({
      id: share.id,
      itemId: share.item_id,
      personId: share.person_id,
      amount: share.amount,
    });
    sharesByItem.set(share.item_id, list);
  }

  const items: ReceiptItemWithShares[] = itemRows.map((item) => ({
    id: item.id,
    receiptId: item.receipt_id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    total: item.total,
    categoryId: item.category_id,
    sortOrder: item.sort_order,
    categoryName: item.category_name,
    categoryColor: item.category_color,
    shares: sharesByItem.get(item.id) ?? [],
  }));

  return {
    ...mapReceipt(row),
    items,
    itemsTotal: items.reduce((acc, item) => acc + item.total, 0),
  };
}

/** Paragon powiązany z transakcją — używane na ekranie szczegółów wydatku. */
export async function getReceiptByTransaction(
  transactionId: number
): Promise<ReceiptWithItems | null> {
  const row = await queryFirst<{ id: number }>(
    'SELECT id FROM receipts WHERE transaction_id = ? LIMIT 1',
    [transactionId]
  );
  return row ? getReceipt(row.id) : null;
}

export interface ReceiptSummary extends Receipt {
  itemCount: number;
  peopleCount: number;
}

/** Lista paragonów (opcjonalnie z jednego miesiąca), najnowsze na górze. */
export async function listReceipts(month?: YearMonth): Promise<ReceiptSummary[]> {
  const sql = `
    SELECT r.id, r.transaction_id, r.merchant, r.date, r.total, r.payer_id, r.source,
           r.raw_text, r.image_uri, r.created_at, r.updated_at,
           (SELECT COUNT(*) FROM receipt_items i WHERE i.receipt_id = r.id) AS item_count,
           (SELECT COUNT(DISTINCT s.person_id) FROM item_shares s
              JOIN receipt_items i2 ON i2.id = s.item_id
              WHERE i2.receipt_id = r.id) AS people_count
    FROM receipts r
    ${month ? 'WHERE substr(r.date, 1, 7) = ?' : ''}
    ORDER BY r.date DESC, r.id DESC
  `;

  const rows = await query<ReceiptRow & { item_count: number; people_count: number }>(
    sql,
    month ? [month] : []
  );

  return rows.map((row) => ({
    ...mapReceipt(row),
    itemCount: row.item_count,
    peopleCount: row.people_count,
  }));
}

/** Aktualizuje nagłówek paragonu (sklep, data, płatnik, suma). */
export async function updateReceipt(
  id: number,
  input: Partial<Pick<ReceiptInput, 'merchant' | 'date' | 'total' | 'payerId'>>
): Promise<void> {
  const row = await queryFirst<ReceiptRow>(`${SELECT_RECEIPT} WHERE id = ?`, [id]);
  if (!row) return;

  await run(
    `UPDATE receipts SET merchant = ?, date = ?, total = ?, payer_id = ?, updated_at = ?
     WHERE id = ?`,
    [
      (input.merchant ?? row.merchant).trim(),
      input.date ?? row.date,
      Math.round(input.total ?? row.total),
      input.payerId !== undefined ? input.payerId : row.payer_id,
      nowTimestamp(),
      id,
    ]
  );
}

/** Podpina paragon pod utworzoną transakcję. */
export async function linkReceiptToTransaction(
  receiptId: number,
  transactionId: number
): Promise<void> {
  await run('UPDATE receipts SET transaction_id = ?, updated_at = ? WHERE id = ?', [
    transactionId,
    nowTimestamp(),
    receiptId,
  ]);
}

export async function addItem(receiptId: number, item: ReceiptItemInput): Promise<number> {
  const maxOrder = await queryFirst<{ value: number | null }>(
    'SELECT MAX(sort_order) AS value FROM receipt_items WHERE receipt_id = ?',
    [receiptId]
  );
  return insertItem(receiptId, item, (maxOrder?.value ?? -1) + 1, nowTimestamp());
}

/** Zapisuje zmienioną pozycję (nazwa, kwota, kategoria). */
export async function updateItem(
  itemId: number,
  input: Partial<Pick<ReceiptItemInput, 'name' | 'quantity' | 'unitPrice' | 'total' | 'categoryId'>>
): Promise<void> {
  const row = await queryFirst<ItemRow>(
    `SELECT id, receipt_id, name, quantity, unit_price, total, category_id, sort_order,
            NULL AS category_name, NULL AS category_color
     FROM receipt_items WHERE id = ?`,
    [itemId]
  );
  if (!row) return;

  await run(
    `UPDATE receipt_items
     SET name = ?, quantity = ?, unit_price = ?, total = ?, category_id = ?, updated_at = ?
     WHERE id = ?`,
    [
      (input.name ?? row.name).trim(),
      Math.round(input.quantity ?? row.quantity),
      Math.round(input.unitPrice ?? row.unit_price),
      Math.round(input.total ?? row.total),
      input.categoryId !== undefined ? input.categoryId : row.category_id,
      nowTimestamp(),
      itemId,
    ]
  );
}

export async function deleteItem(itemId: number): Promise<void> {
  await run('DELETE FROM receipt_items WHERE id = ?', [itemId]);
}

/**
 * Zastępuje komplet udziałów pozycji. Udziały zerowe są pomijane, dzięki
 * czemu "brak przypisania" i "przypisane 0 zł" to w bazie ten sam stan.
 */
export async function setItemShares(
  itemId: number,
  shares: { personId: number; amount: number }[]
): Promise<void> {
  await withTransaction(async () => {
    await run('DELETE FROM item_shares WHERE item_id = ?', [itemId]);
    for (const share of shares) {
      if (share.amount === 0) continue;
      await run('INSERT INTO item_shares (item_id, person_id, amount) VALUES (?, ?, ?)', [
        itemId,
        share.personId,
        Math.round(share.amount),
      ]);
    }
  });
}

export async function deleteReceipt(id: number): Promise<void> {
  await run('DELETE FROM receipts WHERE id = ?', [id]);
}

/** Surowe składniki salda dla każdej osoby — bez właściciela telefonu. */
export interface RawBalanceRow {
  person_id: number;
  owes_me: number;
  i_owe: number;
}

/**
 * Liczy w bazie obie strony salda:
 * - `owes_me` — udziały danej osoby na paragonach opłaconych przeze mnie,
 * - `i_owe`   — moje udziały na paragonach opłaconych przez tę osobę.
 *
 * Paragony bez wskazanego płatnika traktujemy jak opłacone przeze mnie —
 * to najczęstszy przypadek i domyślne zachowanie ekranu skanowania.
 */
export async function loadRawBalances(meId: number): Promise<RawBalanceRow[]> {
  return query<RawBalanceRow>(
    `SELECT p.id AS person_id,
            (SELECT COALESCE(SUM(s.amount), 0)
               FROM item_shares s
               JOIN receipt_items i ON i.id = s.item_id
               JOIN receipts r ON r.id = i.receipt_id
              WHERE s.person_id = p.id AND COALESCE(r.payer_id, ?) = ?) AS owes_me,
            (SELECT COALESCE(SUM(s.amount), 0)
               FROM item_shares s
               JOIN receipt_items i ON i.id = s.item_id
               JOIN receipts r ON r.id = i.receipt_id
              WHERE s.person_id = ? AND r.payer_id = p.id) AS i_owe
     FROM people p
     WHERE p.id != ?
     ORDER BY p.name COLLATE NOCASE`,
    [meId, meId, meId, meId]
  );
}
