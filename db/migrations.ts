/**
 * Schemat bazy danych i migracje.
 *
 * Wersja schematu przechowywana jest w `PRAGMA user_version`, dzięki czemu
 * kolejne wersje aplikacji mogą dodawać migracje bez utraty danych.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { nowTimestamp } from '../utils/dates';

export const SCHEMA_VERSION = 2;

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'bill', 'expense', 'saving')),
  icon TEXT NOT NULL DEFAULT 'pricetag-outline',
  color TEXT NOT NULL DEFAULT '#22C55E',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL DEFAULT 0,
  initial_amount INTEGER NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT 'flag-outline',
  color TEXT NOT NULL DEFAULT '#3FC7C0',
  archived INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'bill', 'expense', 'saving')),
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  day_of_month INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT,
  note TEXT,
  auto_create INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  start_month TEXT NOT NULL,
  end_month TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('income', 'bill', 'expense', 'saving')),
  amount INTEGER NOT NULL,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  payment_method TEXT,
  is_paid INTEGER NOT NULL DEFAULT 1,
  due_date TEXT,
  paid_date TEXT,
  goal_id INTEGER REFERENCES savings_goals (id) ON DELETE SET NULL,
  recurring_id INTEGER REFERENCES recurring_transactions (id) ON DELETE SET NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions (month);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_month
  ON transactions (recurring_id, month) WHERE recurring_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL DEFAULT '*',
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (month, category_id)
);

CREATE TABLE IF NOT EXISTS monthly_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,
  planned_income INTEGER NOT NULL DEFAULT 0,
  planned_bills INTEGER NOT NULL DEFAULT 0,
  planned_expenses INTEGER NOT NULL DEFAULT 0,
  planned_savings INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_hints (
  name_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  last_amount INTEGER,
  uses INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const MIGRATION_2 = `
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7C9CF5',
  is_me INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER REFERENCES transactions (id) ON DELETE CASCADE,
  merchant TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  payer_id INTEGER REFERENCES people (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('scan', 'manual')),
  raw_text TEXT,
  image_uri TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1000,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES receipt_items (id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  UNIQUE (item_id, person_id)
);

CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts (transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts (date);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items (receipt_id);
CREATE INDEX IF NOT EXISTS idx_item_shares_item ON item_shares (item_id);
CREATE INDEX IF NOT EXISTS idx_item_shares_person ON item_shares (person_id);
CREATE INDEX IF NOT EXISTS idx_settlements_person ON settlements (person_id);
`;

/** Kategorie tworzone przy pierwszym uruchomieniu. */
export const DEFAULT_CATEGORIES: {
  name: string;
  kind: 'income' | 'bill' | 'expense' | 'saving';
  icon: string;
  color: string;
}[] = [
  // Wydatki
  { name: 'Jedzenie', kind: 'expense', icon: 'fast-food-outline', color: '#F0546B' },
  { name: 'Transport', kind: 'expense', icon: 'car-outline', color: '#7C9CF5' },
  { name: 'Zakupy', kind: 'expense', icon: 'cart-outline', color: '#F5A524' },
  { name: 'Dom', kind: 'expense', icon: 'home-outline', color: '#3FC7C0' },
  { name: 'Rozrywka', kind: 'expense', icon: 'game-controller-outline', color: '#B48CF2' },
  { name: 'Zdrowie', kind: 'expense', icon: 'medkit-outline', color: '#F27D9D' },
  { name: 'Zwierzęta', kind: 'expense', icon: 'paw-outline', color: '#E0A458' },
  { name: 'Ubrania', kind: 'expense', icon: 'shirt-outline', color: '#5FB0F5' },
  { name: 'Hobby', kind: 'expense', icon: 'color-palette-outline', color: '#8FD14F' },
  { name: 'Prezenty', kind: 'expense', icon: 'gift-outline', color: '#F58BA0' },
  { name: 'Podróże', kind: 'expense', icon: 'airplane-outline', color: '#4FD1C5' },
  { name: 'Inne', kind: 'expense', icon: 'ellipsis-horizontal-outline', color: '#93A1B0' },
  // Przychody
  { name: 'Pensja', kind: 'income', icon: 'briefcase-outline', color: '#22C55E' },
  { name: 'Dodatkowa praca', kind: 'income', icon: 'construct-outline', color: '#16A34A' },
  { name: 'Premia', kind: 'income', icon: 'trophy-outline', color: '#8FD14F' },
  { name: 'Zwrot', kind: 'income', icon: 'return-down-back-outline', color: '#4FD1C5' },
  { name: 'Inne', kind: 'income', icon: 'ellipsis-horizontal-outline', color: '#93A1B0' },
  // Rachunki
  { name: 'Czynsz', kind: 'bill', icon: 'business-outline', color: '#7C9CF5' },
  { name: 'Prąd', kind: 'bill', icon: 'flash-outline', color: '#F5A524' },
  { name: 'Gaz', kind: 'bill', icon: 'flame-outline', color: '#F0546B' },
  { name: 'Woda', kind: 'bill', icon: 'water-outline', color: '#5FB0F5' },
  { name: 'Internet', kind: 'bill', icon: 'wifi-outline', color: '#4FD1C5' },
  { name: 'Telefon', kind: 'bill', icon: 'call-outline', color: '#B48CF2' },
  { name: 'Abonamenty', kind: 'bill', icon: 'repeat-outline', color: '#F58BA0' },
  { name: 'Kredyt', kind: 'bill', icon: 'card-outline', color: '#E0A458' },
  { name: 'Ubezpieczenie', kind: 'bill', icon: 'shield-checkmark-outline', color: '#8FD14F' },
  { name: 'Inne', kind: 'bill', icon: 'ellipsis-horizontal-outline', color: '#93A1B0' },
  // Oszczędności
  { name: 'Oszczędności', kind: 'saving', icon: 'wallet-outline', color: '#3FC7C0' },
  { name: 'Poduszka finansowa', kind: 'saving', icon: 'umbrella-outline', color: '#4FD1C5' },
  { name: 'Inwestycje', kind: 'saving', icon: 'trending-up-outline', color: '#22C55E' },
  { name: 'Inne', kind: 'saving', icon: 'ellipsis-horizontal-outline', color: '#93A1B0' },
];

/** Ustawienia startowe aplikacji. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  currency: 'PLN',
  currency_symbol: 'zł',
  onboarding_done: '0',
  default_budget: '0',
  default_saving: '0',
  saving_percent: '0',
  lock_enabled: '0',
  biometrics_enabled: '0',
  notifications_enabled: '0',
  bills_reminder_days: '1',
  budget_alerts_enabled: '1',
  demo_data_loaded: '0',
  schema_version: String(SCHEMA_VERSION),
};

/** Wykonuje migracje do najnowszej wersji schematu. */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(MIGRATION_1);
    await db.execAsync(`PRAGMA user_version = 1`);
  }

  if (currentVersion < 2) {
    await db.execAsync(MIGRATION_2);
    await db.execAsync(`PRAGMA user_version = 2`);
  }

  // Kolejne migracje dodajemy tutaj:
  // if (currentVersion < 3) { await db.execAsync(MIGRATION_3); await db.execAsync('PRAGMA user_version = 3'); }

  await seedDefaults(db);
}

/**
 * Uzupełnia dane startowe. Funkcja jest idempotentna:
 * kategorie tworzy tylko wtedy, gdy tabela jest pusta, a ustawienia
 * dodaje wyłącznie dla brakujących kluczy.
 */
export async function seedDefaults(db: SQLiteDatabase): Promise<void> {
  const timestamp = nowTimestamp();

  const categoryCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM categories'
  );

  if ((categoryCount?.count ?? 0) === 0) {
    const statement = await db.prepareAsync(
      `INSERT INTO categories (name, kind, icon, color, sort_order, is_default, archived, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`
    );
    try {
      for (let index = 0; index < DEFAULT_CATEGORIES.length; index += 1) {
        const category = DEFAULT_CATEGORIES[index];
        await statement.executeAsync([
          category.name,
          category.kind,
          category.icon,
          category.color,
          index,
          timestamp,
          timestamp,
        ]);
      }
    } finally {
      await statement.finalizeAsync();
    }
  }

  // Właściciel telefonu — punkt odniesienia dla wszystkich sald.
  const meCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM people WHERE is_me = 1'
  );

  if ((meCount?.count ?? 0) === 0) {
    await db.runAsync(
      `INSERT INTO people (name, color, is_me, archived, is_demo, created_at, updated_at)
       VALUES (?, ?, 1, 0, 0, ?, ?)`,
      ['Ja', '#22C55E', timestamp, timestamp]
    );
  }

  const settingsStatement = await db.prepareAsync(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  try {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await settingsStatement.executeAsync([key, value]);
    }
  } finally {
    await settingsStatement.finalizeAsync();
  }
}
