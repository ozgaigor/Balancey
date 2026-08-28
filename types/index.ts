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

/* ------------------------------------------------------------------ *
 * Paragony, pozycje i podział kosztów między osoby.
 * ------------------------------------------------------------------ */

/** Osoba uczestnicząca w podziale kosztów (domownik, współlokator, znajomy). */
export interface Person {
  id: number;
  name: string;
  color: string;
  /** Właściciel telefonu. Dokładnie jedna osoba ma tę flagę. */
  isMe: boolean;
  archived: boolean;
  isDemo: boolean;
}

/** Skąd wzięły się pozycje paragonu. */
export type ReceiptSource = 'scan' | 'manual';

export interface Receipt {
  id: number;
  /** Wydatek utworzony z tego paragonu (usunięcie wydatku kasuje paragon). */
  transactionId: number | null;
  merchant: string;
  date: ISODate;
  /**
   * Wartość paragonu w groszach — zawsze równa sumie pozycji i kwocie
   * powiązanego wydatku. Suma odczytana przez OCR służy tylko do kontroli
   * na ekranie skanowania i nie jest tu przechowywana.
   */
  total: number;
  /** Kto zapłacił przy kasie. Pozostałe osoby są mu winne swoje udziały. */
  payerId: number | null;
  source: ReceiptSource;
  /** Surowy tekst z OCR — pozwala poprawić parsowanie bez ponownego skanu. */
  rawText: string | null;
  imageUri: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ilość jest przechowywana jako liczba całkowita pomnożona przez 1000,
 * dzięki czemu waga "0,432 kg" nie wymaga liczb zmiennoprzecinkowych.
 */
export const QUANTITY_SCALE = 1000;

export interface ReceiptItem {
  id: number;
  receiptId: number;
  name: string;
  /** Ilość × 1000 (1 szt. = 1000, 0,432 kg = 432). */
  quantity: number;
  /** Cena jednostkowa w groszach. */
  unitPrice: number;
  /** Wartość pozycji w groszach — to ona jest źródłem prawdy. */
  total: number;
  categoryId: number | null;
  sortOrder: number;
}

/** Udział jednej osoby w jednej pozycji, w groszach. */
export interface ItemShare {
  id: number;
  itemId: number;
  personId: number;
  amount: number;
}

/** Pozycja wraz z przypisanymi udziałami — podstawowy kształt w interfejsie. */
export interface ReceiptItemWithShares extends ReceiptItem {
  categoryName: string | null;
  categoryColor: string | null;
  shares: ItemShare[];
}

/** Paragon z pozycjami — komplet danych ekranu podziału. */
export interface ReceiptWithItems extends Receipt {
  items: ReceiptItemWithShares[];
  /** Suma wartości pozycji; może się różnić od `total` przy błędach OCR. */
  itemsTotal: number;
}

/** Zapisane rozliczenie gotówkowe z osobą. */
export interface Settlement {
  id: number;
  personId: number;
  /** Dodatnia — osoba oddała mi pieniądze. Ujemna — ja oddałem osobie. */
  amount: number;
  date: ISODate;
  note: string | null;
  createdAt: string;
}

/** Saldo z jedną osobą: dodatnie = osoba jest mi winna. */
export interface PersonBalance {
  person: Person;
  /** Ile ta osoba wydała z moich pieniędzy (jej udziały na moich paragonach). */
  owesMe: number;
  /** Ile ja wydałem z jej pieniędzy (moje udziały na jej paragonach). */
  iOwe: number;
  /** Suma zapisanych rozliczeń. */
  settled: number;
  /** owesMe - iOwe - settled. */
  balance: number;
}
