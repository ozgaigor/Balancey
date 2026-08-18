/**
 * Wspólne typy domenowe aplikacji.
 *
 * Zasada nr 1: wszystkie kwoty są liczbami całkowitymi w GROSZACH.
 * 42,50 zł -> 4250. Dzięki temu nie występują błędy zmiennoprzecinkowe.
 */

/** Typ transakcji. */
export type TransactionType = 'income' | 'bill' | 'expense' | 'saving';

/** Metoda płatności (opcjonalna). */
export type PaymentMethod = 'cash' | 'card' | 'blik' | 'transfer' | 'other';

/** Data w formacie ISO: YYYY-MM-DD. */
export type ISODate = string;

/** Miesiąc w formacie YYYY-MM. */
export type YearMonth = string;

export interface Category {
  id: number;
  name: string;
  /** Do jakiego typu transakcji należy kategoria. */
  kind: TransactionType;
  /** Nazwa ikony z zestawu Ionicons. */
  icon: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  archived: boolean;
  isDemo: boolean;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  /** Kwota w groszach, zawsze dodatnia. Znak wynika z typu transakcji. */
  amount: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  date: ISODate;
  month: YearMonth;
  paymentMethod: PaymentMethod | null;
  /** Dla rachunków: czy zapłacony. Dla pozostałych typów zawsze true. */
  isPaid: boolean;
  dueDate: ISODate | null;
  paidDate: ISODate | null;
  goalId: number | null;
  recurringId: number | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Transakcja wraz z danymi kategorii (do list i podsumowań). */
export interface TransactionWithCategory extends Transaction {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

export interface RecurringTransaction {
  id: number;
  type: TransactionType;
  name: string;
  amount: number;
  categoryId: number | null;
  /** Dzień miesiąca 1-31, przycinany do długości miesiąca. */
  dayOfMonth: number;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  /** Czy aplikacja ma automatycznie tworzyć transakcje. */
  autoCreate: boolean;
  active: boolean;
  startMonth: YearMonth;
  endMonth: YearMonth | null;
  isDemo: boolean;
}

export interface Budget {
  month: YearMonth;
  amount: number;
}

export interface CategoryBudget {
  id: number;
  /** '*' oznacza limit obowiązujący w każdym miesiącu. */
  month: YearMonth | '*';
  categoryId: number;
  amount: number;
}

export interface SavingsGoal {
  id: number;
  name: string;
  targetAmount: number;
  /** Kwota odłożona przed rozpoczęciem prowadzenia budżetu w aplikacji. */
  initialAmount: number;
  icon: string;
  color: string;
  archived: boolean;
  isDemo: boolean;
}

export interface SavingsGoalWithProgress extends SavingsGoal {
  savedAmount: number;
  percent: number;
}

export interface MonthlyPlan {
  month: YearMonth;
  plannedIncome: number;
  plannedBills: number;
  plannedExpenses: number;
  plannedSavings: number;
  note: string | null;
}

/** Podpowiedź kategorii dla nazwy (np. "biedronka" -> Jedzenie). */
export interface MerchantHint {
  nameKey: string;
  displayName: string;
  categoryId: number | null;
  type: TransactionType;
  lastAmount: number | null;
  uses: number;
  updatedAt: string;
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  onboardingDone: boolean;
  /** Domyślny budżet miesięczny w groszach (0 = brak). */
  defaultBudget: number;
  /** Domyślna kwota oszczędności w groszach (0 = brak). */
  defaultSaving: number;
  /** Procent dochodu przeznaczany na oszczędności (0-100, 0 = wyłączone). */
  savingPercent: number;
  lockEnabled: boolean;
  biometricsEnabled: boolean;
  pinHash: string | null;
  pinSalt: string | null;
  notificationsEnabled: boolean;
  /** Ile dni przed terminem przypominać o rachunku. */
  billsReminderDays: number;
  budgetAlertsEnabled: boolean;
  demoDataLoaded: boolean;
}
