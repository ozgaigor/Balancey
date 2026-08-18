/**
 * Czysta logika obliczeniowa budżetu — bez React i bez bazy danych.
 * Dzięki temu można ją w całości pokryć testami (katalog __tests__).
 *
 * Wszystkie kwoty to liczby całkowite w groszach.
 */

import type { TransactionType } from '../types';

/** Minimalny kształt transakcji potrzebny do obliczeń. */
export interface CalcTransaction {
  type: TransactionType;
  amount: number;
  isPaid: boolean;
  categoryId: number | null;
  date: string;
  name?: string;
}

export interface MonthSummary {
  /** Suma przychodów. */
  income: number;
  /** Rachunki opłacone — wchodzą do salda. */
  billsPaid: number;
  /** Rachunki jeszcze nieopłacone ("Do zapłaty"). */
  billsUnpaid: number;
  /** Wszystkie rachunki miesiąca. */
  billsTotal: number;
  /** Suma wydatków. */
  expenses: number;
  /** Suma oszczędności odłożonych w miesiącu. */
  savings: number;
  /** Pozostało = przychody - rachunki opłacone - wydatki - oszczędności. */
  remaining: number;
  /** Ile zostanie po opłaceniu wszystkich zaległych rachunków. */
  remainingAfterUnpaid: number;
  /** Wszystko, co wypłynęło z portfela (rachunki opłacone + wydatki + oszczędności). */
  outflow: number;
  /** Liczba transakcji w miesiącu. */
  count: number;
}

export const EMPTY_SUMMARY: MonthSummary = {
  income: 0,
  billsPaid: 0,
  billsUnpaid: 0,
  billsTotal: 0,
  expenses: 0,
  savings: 0,
  remaining: 0,
  remainingAfterUnpaid: 0,
  outflow: 0,
  count: 0,
};

/**
 * Podsumowuje listę transakcji jednego miesiąca.
 *
 * Rachunek nieopłacony nie pomniejsza salda — jest pokazywany osobno
 * jako "Do zapłaty" (zgodnie z logiką ekranu Rachunki).
 */
export function summarize(transactions: CalcTransaction[]): MonthSummary {
  let income = 0;
  let billsPaid = 0;
  let billsUnpaid = 0;
  let expenses = 0;
  let savings = 0;

  for (const tx of transactions) {
    const amount = Math.abs(Math.round(tx.amount));
    switch (tx.type) {
      case 'income':
        income += amount;
        break;
      case 'bill':
        if (tx.isPaid) billsPaid += amount;
        else billsUnpaid += amount;
        break;
      case 'expense':
        expenses += amount;
        break;
      case 'saving':
        savings += amount;
        break;
      default:
        break;
    }
  }

  const remaining = income - billsPaid - expenses - savings;

  return {
    income,
    billsPaid,
    billsUnpaid,
    billsTotal: billsPaid + billsUnpaid,
    expenses,
    savings,
    remaining,
    remainingAfterUnpaid: remaining - billsUnpaid,
    outflow: billsPaid + expenses + savings,
    count: transactions.length,
  };
}

/**
 * Procent wykorzystania budżetu (0 = brak limitu).
 * Wynik nie jest ograniczany do 100 — przekroczenie ma być widoczne.
 */
export function budgetUsedPercent(spent: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.round((spent * 100) / limit);
}

/** Procent do rysowania paska postępu — przycięty do zakresu 0-100. */
export function progressPercent(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value * 100) / total)));
}

/** Udział wartości w całości, w procentach z jednym miejscem po przecinku. */
export function shareOfTotal(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((value * 1000) / total) / 10;
}

/** Ile zostało z limitu (może być ujemne przy przekroczeniu). */
export function budgetRemaining(spent: number, limit: number): number {
  return limit - spent;
}

/**
 * Sugerowany limit dzienny: pozostały budżet podzielony na pozostałe dni.
 * Zwraca 0, gdy brak dni lub budżet jest już przekroczony.
 */
export function suggestedDailyLimit(remainingBudget: number, daysLeft: number): number {
  if (daysLeft <= 0 || remainingBudget <= 0) return 0;
  return Math.floor(remainingBudget / daysLeft);
}

/** Średni dzienny wydatek w miesiącu. */
export function averageDaily(total: number, days: number): number {
  if (days <= 0) return 0;
  return Math.round(total / days);
}

export interface CategoryTotal {
  categoryId: number | null;
  total: number;
  count: number;
}

/** Sumuje transakcje wybranego typu w rozbiciu na kategorie (malejąco). */
export function sumByCategory(
  transactions: CalcTransaction[],
  type?: TransactionType
): CategoryTotal[] {
  const map = new Map<number | null, CategoryTotal>();

  for (const tx of transactions) {
    if (type && tx.type !== type) continue;
    if (tx.type === 'bill' && !tx.isPaid) continue;
    const key = tx.categoryId ?? null;
    const current = map.get(key) ?? { categoryId: key, total: 0, count: 0 };
    current.total += Math.abs(Math.round(tx.amount));
    current.count += 1;
    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

/** Największa pojedyncza transakcja wybranego typu. */
export function largest(
  transactions: CalcTransaction[],
  type: TransactionType = 'expense'
): CalcTransaction | null {
  let best: CalcTransaction | null = null;
  for (const tx of transactions) {
    if (tx.type !== type) continue;
    if (!best || Math.abs(tx.amount) > Math.abs(best.amount)) best = tx;
  }
  return best;
}

/**
 * Zmiana procentowa względem poprzedniej wartości.
 * Zwraca null, gdy nie ma punktu odniesienia (poprzednia wartość = 0).
 */
export function percentChange(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null;
  return Math.round(((current - previous) * 100) / previous);
}

/** Suma kwot z listy transakcji (wartości bezwzględne). */
export function sumAmounts(transactions: CalcTransaction[]): number {
  return transactions.reduce((acc, tx) => acc + Math.abs(Math.round(tx.amount)), 0);
}

/** Grupuje transakcje po dacie i zwraca sumy dzienne (rosnąco po dacie). */
export function dailyTotals(
  transactions: CalcTransaction[],
  type: TransactionType = 'expense'
): { date: string; total: number }[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== type) continue;
    map.set(tx.date, (map.get(tx.date) ?? 0) + Math.abs(Math.round(tx.amount)));
  }
  return Array.from(map.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Realizacja planu miesiąca: różnica między rzeczywistością a planem.
 * Dodatnia różnica dla wydatków oznacza przekroczenie planu.
 */
export function planDifference(planned: number, actual: number): number {
  return actual - planned;
}

/** Postęp celu oszczędnościowego w procentach (0-100+). */
export function goalPercent(saved: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.round((saved * 100) / target);
}

/** Kwota oszczędności wynikająca z procentu dochodu. */
export function savingFromPercent(income: number, percent: number): number {
  if (percent <= 0 || income <= 0) return 0;
  return Math.round((income * percent) / 100);
}
