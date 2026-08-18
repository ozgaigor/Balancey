/**
 * Operacje na transakcjach wraz z efektami ubocznymi:
 * zapamiętywaniem kategorii dla nazwy oraz sprawdzaniem limitów budżetu.
 */

import type { ISODate, TransactionType, YearMonth } from '../types';
import { budgetUsedPercent } from '../utils/calculations';
import { formatMoney } from '../utils/currency';
import { todayISO, yearMonthOf } from '../utils/dates';
import { rememberHint } from '../db/repositories/hints';
import {
  createTransaction,
  deleteTransaction,
  duplicateTransaction,
  setBillPaid,
  updateTransaction,
  type TransactionInput,
} from '../db/repositories/transactions';
import { getMonthOverview } from './budgetService';

export interface BudgetAlert {
  level: 'warning' | 'danger';
  title: string;
  body: string;
}

export interface SaveResult {
  id: number;
  /** Krótkie potwierdzenie pokazywane po zapisie, np. "Dodano 42,50 zł". */
  message: string;
  alerts: BudgetAlert[];
}

/** Dodaje transakcję i zwraca komunikat oraz ewentualne ostrzeżenia budżetowe. */
export async function addTransaction(input: TransactionInput): Promise<SaveResult> {
  const id = await createTransaction(input);

  if (input.name.trim() !== '') {
    await rememberHint(input.name, input.type, input.categoryId, input.amount);
  }

  const alerts = input.type === 'expense' ? await checkBudgetAlerts(yearMonthOf(input.date)) : [];

  return {
    id,
    message: `${actionLabel(input.type)} ${formatMoney(input.amount)}`,
    alerts,
  };
}

function actionLabel(type: TransactionType): string {
  switch (type) {
    case 'income':
      return 'Dodano przychód';
    case 'bill':
      return 'Dodano rachunek';
    case 'saving':
      return 'Odłożono';
    default:
      return 'Dodano';
  }
}

/** Zapisuje zmiany w istniejącej transakcji. */
export async function editTransaction(id: number, input: TransactionInput): Promise<SaveResult> {
  await updateTransaction(id, input);

  if (input.name.trim() !== '') {
    await rememberHint(input.name, input.type, input.categoryId, input.amount);
  }

  const alerts = input.type === 'expense' ? await checkBudgetAlerts(yearMonthOf(input.date)) : [];

  return { id, message: 'Zapisano zmiany', alerts };
}

export async function removeTransaction(id: number): Promise<void> {
  await deleteTransaction(id);
}

/** Oznacza rachunek jako zapłacony / niezapłacony. */
export async function toggleBillPaid(id: number, paid: boolean, date: ISODate = todayISO()): Promise<void> {
  await setBillPaid(id, paid, date);
}

/** Tworzy kopię transakcji z dzisiejszą datą. */
export async function duplicate(id: number): Promise<number | null> {
  return duplicateTransaction(id, todayISO());
}

/**
 * Sprawdza limity po dodaniu wydatku:
 * limit miesięczny (80% i przekroczenie) oraz limity kategorii.
 */
export async function checkBudgetAlerts(month: YearMonth): Promise<BudgetAlert[]> {
  const overview = await getMonthOverview(month);
  const alerts: BudgetAlert[] = [];

  if (overview.budget.hasLimit) {
    if (overview.budget.exceeded) {
      alerts.push({
        level: 'danger',
        title: 'Przekroczono budżet miesiąca',
        body: `Wydatki: ${formatMoney(overview.budget.spent)} z ${formatMoney(overview.budget.limit)}.`,
      });
    } else if (overview.budget.percent >= 80) {
      alerts.push({
        level: 'warning',
        title: `Wykorzystano ${overview.budget.percent}% budżetu`,
        body: `Zostało ${formatMoney(overview.budget.left)} do końca miesiąca.`,
      });
    }
  }

  for (const category of overview.categoryBudgets) {
    if (category.exceeded) {
      alerts.push({
        level: 'danger',
        title: `Przekroczono limit: ${category.name}`,
        body: `${formatMoney(category.total)} z ${formatMoney(category.limit)}.`,
      });
    } else if (budgetUsedPercent(category.total, category.limit) >= 90) {
      alerts.push({
        level: 'warning',
        title: `${category.name}: blisko limitu`,
        body: `${formatMoney(category.total)} z ${formatMoney(category.limit)}.`,
      });
    }
  }

  return alerts;
}
