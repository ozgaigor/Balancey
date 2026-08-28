/**
 * Paragon jako całość: od tekstu z OCR, przez roboczą listę pozycji
 * z przypisanymi osobami, po zapis wydatku w budżecie.
 *
 * Przyjęty model (decyzja projektowa):
 * jeden paragon = JEDEN wydatek na pełną kwotę. Pozycje są szczegółem
 * tego wydatku, a podział na osoby nie zmienia kwot w budżecie —
 * liczy się osobno, jako saldo z każdą osobą. Dzięki temu istniejące
 * ekrany budżetu, statystyk i historii działają bez żadnych zmian.
 */

import type { ISODate, ReceiptSource, ReceiptWithItems } from '../types';
import { guessCategory, guessCategoryForMerchant } from '../utils/itemCategories';
import { parseReceipt, type ParsedReceipt } from '../utils/receiptParser';
import { shareEvenly } from '../utils/split';
import { todayISO } from '../utils/dates';
import { findCategoryByName } from '../db/repositories/categories';
import { getMe } from '../db/repositories/people';
import {
  createReceipt,
  deleteReceipt,
  getReceipt,
  linkReceiptToTransaction,
  updateReceipt,
  type ReceiptItemInput,
} from '../db/repositories/receipts';
import { getTransaction, updateTransaction } from '../db/repositories/transactions';
import { addTransaction, removeTransaction } from './transactionService';
import type { SaveResult } from './transactionService';

/** Pozycja w trakcie edycji — żyje w stanie ekranu, jeszcze nie w bazie. */
export interface DraftItem {
  /** Klucz listy w interfejsie; nie trafia do bazy. */
  key: string;
  name: string;
  /** Ilość × 1000. */
  quantity: number;
  unitPrice: number;
  /** Wartość pozycji w groszach. */
  total: number;
  categoryId: number | null;
  /** Osoby dzielące tę pozycję po równo; pusta lista = koszt wspólny. */
  personIds: number[];
}

export interface DraftReceipt {
  merchant: string;
  date: ISODate;
  /** Suma odczytana z paragonu — do porównania z sumą pozycji. */
  scannedTotal: number | null;
  source: ReceiptSource;
  rawText: string | null;
  imageUri: string | null;
  items: DraftItem[];
  warnings: string[];
  /** Kategoria całego paragonu, użyta dla pozycji bez własnego dopasowania. */
  fallbackCategoryId: number | null;
}

let keyCounter = 0;

/** Nadaje pozycji unikalny klucz na czas edycji. */
export function nextItemKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

/** Suma wartości pozycji roboczych — kwota, która trafi do budżetu. */
export function draftTotal(items: DraftItem[]): number {
  return items.reduce((acc, item) => acc + item.total, 0);
}

/**
 * Zamienia tekst z OCR na gotowy do edycji paragon:
 * rozpoznaje pozycje, przypisuje im kategorie i domyślnie przypina
 * wszystko do właściciela telefonu (najczęstszy przypadek — potem
 * użytkownik odznacza to, co jest czyjeś).
 */
export async function buildDraftFromText(
  rawText: string,
  imageUri: string | null = null
): Promise<DraftReceipt> {
  const parsed = parseReceipt(rawText);
  return buildDraftFromParsed(parsed, rawText, imageUri, 'scan');
}

/** Pusty paragon do wypełnienia ręcznie. */
export async function buildEmptyDraft(): Promise<DraftReceipt> {
  return {
    merchant: '',
    date: todayISO(),
    scannedTotal: null,
    source: 'manual',
    rawText: null,
    imageUri: null,
    items: [],
    warnings: [],
    fallbackCategoryId: await resolveCategoryId(guessCategoryForMerchant('')),
  };
}

/** Wspólna część budowania wersji roboczej — także dla ponownego parsowania. */
export async function buildDraftFromParsed(
  parsed: ParsedReceipt,
  rawText: string | null,
  imageUri: string | null,
  source: ReceiptSource
): Promise<DraftReceipt> {
  const me = await getMe();
  const fallbackCategoryId = await resolveCategoryId(guessCategoryForMerchant(parsed.merchant));

  // Kategorie zgadujemy raz na nazwę, żeby nie odpytywać bazy dla każdej pozycji.
  const guessCache = new Map<string, number | null>();

  const items: DraftItem[] = [];
  for (const item of parsed.items) {
    const guessed = guessCategory(item.name);
    let categoryId = fallbackCategoryId;

    if (guessed) {
      if (!guessCache.has(guessed)) {
        guessCache.set(guessed, await resolveCategoryId(guessed));
      }
      categoryId = guessCache.get(guessed) ?? fallbackCategoryId;
    }

    items.push({
      key: nextItemKey(),
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      categoryId,
      personIds: me ? [me.id] : [],
    });
  }

  return {
    merchant: parsed.merchant,
    date: parsed.date ?? todayISO(),
    scannedTotal: parsed.total,
    source,
    rawText,
    imageUri,
    items,
    warnings: parsed.warnings,
    fallbackCategoryId,
  };
}

/** Zamienia nazwę kategorii domyślnej na identyfikator z bazy. */
async function resolveCategoryId(name: string | null): Promise<number | null> {
  if (!name) return null;
  const category = await findCategoryByName(name, 'expense');
  return category?.id ?? null;
}

export interface SaveReceiptResult extends SaveResult {
  receiptId: number;
  transactionId: number;
}

/**
 * Zapisuje paragon: tworzy wydatek na pełną kwotę, a pod nim pozycje
 * wraz z udziałami osób. Kwota wydatku to zawsze suma pozycji — dzięki
 * temu szczegóły nigdy nie rozjeżdżają się z budżetem.
 */
export async function saveReceipt(
  draft: DraftReceipt,
  payerId: number | null
): Promise<SaveReceiptResult> {
  if (draft.items.length === 0) {
    throw new Error('Paragon nie ma żadnej pozycji.');
  }

  const total = draftTotal(draft.items);
  if (total <= 0) {
    throw new Error('Suma pozycji musi być większa od zera.');
  }

  const name = draft.merchant.trim() || 'Zakupy';

  const saved = await addTransaction({
    type: 'expense',
    amount: total,
    categoryId: dominantCategoryId(draft),
    name,
    description: describe(draft),
    date: draft.date,
  });

  const items: ReceiptItemInput[] = draft.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
    categoryId: item.categoryId,
    shares: shareEvenly(item.total, item.personIds),
  }));

  const receiptId = await createReceipt({
    transactionId: saved.id,
    merchant: name,
    date: draft.date,
    total,
    payerId,
    source: draft.source,
    rawText: draft.rawText,
    imageUri: draft.imageUri,
    items,
  });

  await linkReceiptToTransaction(receiptId, saved.id);

  return { ...saved, receiptId, transactionId: saved.id };
}

/**
 * Kategoria wydatku to ta, na którą poszło najwięcej pieniędzy —
 * lepiej opisuje paragon niż kategoria pierwszej pozycji.
 */
function dominantCategoryId(draft: DraftReceipt): number | null {
  const totals = new Map<number, number>();

  for (const item of draft.items) {
    if (item.categoryId == null) continue;
    totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + item.total);
  }

  let best: number | null = null;
  let bestTotal = -1;
  for (const [categoryId, total] of totals) {
    if (total > bestTotal) {
      best = categoryId;
      bestTotal = total;
    }
  }

  return best ?? draft.fallbackCategoryId;
}

/** Krótki opis wydatku widoczny w historii transakcji. */
function describe(draft: DraftReceipt): string {
  const count = draft.items.length;
  const suffix = count === 1 ? 'pozycja' : count < 5 ? 'pozycje' : 'pozycji';
  return `Paragon: ${count} ${suffix}`;
}

/**
 * Po każdej zmianie pozycji zapisanego paragonu wyrównuje kwotę paragonu
 * i powiązanego wydatku do sumy pozycji. Bez tego szczegóły paragonu
 * i historia budżetu zaczęłyby pokazywać różne liczby.
 *
 * Zwraca nową sumę albo null, gdy paragonu już nie ma.
 */
export async function syncReceiptTotals(receiptId: number): Promise<number | null> {
  const receipt = await getReceipt(receiptId);
  if (!receipt) return null;

  const total = receipt.itemsTotal;

  if (total !== receipt.total) {
    await updateReceipt(receiptId, { total });
  }

  if (receipt.transactionId != null && total > 0) {
    const transaction = await getTransaction(receipt.transactionId);
    if (transaction && transaction.amount !== total) {
      await updateTransaction(receipt.transactionId, {
        type: transaction.type,
        amount: total,
        categoryId: transaction.categoryId,
        name: transaction.name,
        description: transaction.description,
        date: transaction.date,
        paymentMethod: transaction.paymentMethod,
        isPaid: transaction.isPaid,
        dueDate: transaction.dueDate,
        paidDate: transaction.paidDate,
        goalId: transaction.goalId,
        recurringId: transaction.recurringId,
      });
    }
  }

  return total;
}

/**
 * Usuwa paragon razem z powiązanym wydatkiem — z punktu widzenia
 * użytkownika to jedna rzecz, więc kasujemy ją w całości.
 */
export async function deleteReceiptWithTransaction(receiptId: number): Promise<void> {
  const receipt = await getReceipt(receiptId);
  if (!receipt) return;

  if (receipt.transactionId != null) {
    // Kaskada w schemacie usunie paragon, pozycje i udziały.
    await removeTransaction(receipt.transactionId);
    return;
  }

  await deleteReceipt(receiptId);
}

/** Ponownie parsuje zapisany tekst OCR — po poprawkach w parserze. */
export async function reparseReceipt(receipt: ReceiptWithItems): Promise<DraftReceipt | null> {
  if (!receipt.rawText) return null;
  const parsed = parseReceipt(receipt.rawText);
  return buildDraftFromParsed(parsed, receipt.rawText, receipt.imageUri, receipt.source);
}

/** Wczytuje zapisany paragon i zamienia go z powrotem na wersję roboczą. */
export async function loadDraft(receiptId: number): Promise<DraftReceipt | null> {
  const receipt = await getReceipt(receiptId);
  if (!receipt) return null;

  return {
    merchant: receipt.merchant,
    date: receipt.date,
    scannedTotal: receipt.total,
    source: receipt.source,
    rawText: receipt.rawText,
    imageUri: receipt.imageUri,
    fallbackCategoryId: null,
    warnings: [],
    items: receipt.items.map((item) => ({
      key: nextItemKey(),
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      categoryId: item.categoryId,
      personIds: item.shares.map((share) => share.personId),
    })),
  };
}
