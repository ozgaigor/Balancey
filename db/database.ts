/**
 * Połączenie z lokalną bazą SQLite.
 *
 * Baza żyje wyłącznie na urządzeniu użytkownika — aplikacja nie wysyła
 * żadnych danych finansowych do sieci.
 */

import * as SQLite from 'expo-sqlite';

import { runMigrations } from './migrations';

export const DATABASE_NAME = 'budzet.db';

let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Zwraca gotową do użycia bazę. Pierwsze wywołanie otwiera plik bazy
 * i wykonuje migracje; kolejne korzystają z tego samego połączenia.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      database = db;
      return db;
    })().catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

/** Zapytanie zwracające listę wierszy. */
export async function query<T>(sql: string, params: SQLite.SQLiteBindParams = []): Promise<T[]> {
  const db = await getDb();
  return db.getAllAsync<T>(sql, params);
}

/** Zapytanie zwracające pierwszy wiersz lub null. */
export async function queryFirst<T>(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): Promise<T | null> {
  const db = await getDb();
  return db.getFirstAsync<T>(sql, params);
}

/** Zapytanie modyfikujące dane (INSERT / UPDATE / DELETE). */
export async function run(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): Promise<SQLite.SQLiteRunResult> {
  const db = await getDb();
  return db.runAsync(sql, params);
}

/** Wykonuje zestaw operacji w jednej transakcji. */
export async function withTransaction(task: () => Promise<void>): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(task);
}

/**
 * Czyści wszystkie dane użytkownika (używane przy przywracaniu kopii zapasowej).
 * Kategorie domyślne i ustawienia są odtwarzane przez `seedDefaults`.
 */
export async function wipeAllData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM transactions;
    DELETE FROM recurring_transactions;
    DELETE FROM budget_categories;
    DELETE FROM budgets;
    DELETE FROM savings_goals;
    DELETE FROM monthly_plans;
    DELETE FROM merchant_hints;
    DELETE FROM categories;
    DELETE FROM settings;
    PRAGMA foreign_keys = ON;
  `);
}

/** Zamyka połączenie (wykorzystywane po przywróceniu kopii zapasowej). */
export async function closeDb(): Promise<void> {
  if (database) {
    await database.closeAsync();
    database = null;
    opening = null;
  }
}
