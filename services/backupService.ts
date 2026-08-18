/**
 * Kopia zapasowa i eksport danych.
 *
 * Wszystko odbywa się lokalnie: plik powstaje w katalogu dokumentów
 * aplikacji, a użytkownik sam decyduje, gdzie go zapisać przez systemowe
 * okno udostępniania. Nic nie jest wysyłane na żaden serwer.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { getDb, query, run, wipeAllData } from '../db/database';
import { seedDefaults } from '../db/migrations';
import { moneyToPlainString } from '../utils/currency';
import { formatDatePL, nowTimestamp, todayISO } from '../utils/dates';
import { typeLabel } from '../theme';
import type { TransactionType } from '../types';

export const BACKUP_FORMAT = 'budzet-domowy-backup';
export const BACKUP_VERSION = 1;

interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
  data: {
    categories: Record<string, unknown>[];
    transactions: Record<string, unknown>[];
    recurring_transactions: Record<string, unknown>[];
    budgets: Record<string, unknown>[];
    budget_categories: Record<string, unknown>[];
    savings_goals: Record<string, unknown>[];
    monthly_plans: Record<string, unknown>[];
    merchant_hints: Record<string, unknown>[];
    settings: Record<string, unknown>[];
  };
}

/**
 * Kolejność ma znaczenie przy przywracaniu: tabele nadrzędne muszą trafić
 * do bazy przed tymi, które się do nich odwołują (klucze obce są włączone).
 */
const TABLES = [
  'categories',
  'savings_goals',
  'recurring_transactions',
  'transactions',
  'budgets',
  'budget_categories',
  'monthly_plans',
  'merchant_hints',
  'settings',
] as const;

/** Zbiera całą zawartość bazy do jednego obiektu. */
export async function buildBackup(): Promise<BackupFile> {
  const data = {} as BackupFile['data'];
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    const rows = await query<Record<string, unknown>>(`SELECT * FROM ${table}`);
    (data as Record<string, unknown>)[table] = rows;
    counts[table] = rows.length;
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowTimestamp(),
    counts,
    data,
  };
}

async function writeAndShare(fileName: string, content: string, mimeType: string): Promise<string> {
  const file = new File(Paths.document, fileName);
  if (file.exists) file.delete();
  file.create({ overwrite: true, intermediates: true });
  file.write(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  }

  return file.uri;
}

function timestampForFileName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
}

/** Tworzy plik kopii zapasowej JSON i otwiera okno zapisu / udostępniania. */
export async function exportBackup(): Promise<{ uri: string; fileName: string }> {
  const backup = await buildBackup();
  const fileName = `budzet-kopia-${timestampForFileName()}.json`;
  const uri = await writeAndShare(fileName, JSON.stringify(backup, null, 2), 'application/json');
  return { uri, fileName };
}

/** Eksport wszystkich transakcji do CSV (średnik + BOM — otwiera się w Excelu). */
export async function exportCsv(): Promise<{ uri: string; fileName: string }> {
  const rows = await query<{
    date: string;
    type: TransactionType;
    name: string;
    description: string | null;
    amount: number;
    payment_method: string | null;
    is_paid: number;
    category_name: string | null;
  }>(
    `SELECT t.date, t.type, t.name, t.description, t.amount, t.payment_method, t.is_paid,
            c.name AS category_name
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     ORDER BY t.date, t.id`
  );

  const escapeCsv = (value: string | null | undefined): string => {
    const text = (value ?? '').replace(/"/g, '""');
    return `"${text}"`;
  };

  const header = [
    'Data',
    'Typ',
    'Kategoria',
    'Nazwa',
    'Opis',
    'Kwota',
    'Metoda płatności',
    'Status',
  ].join(';');

  const lines = rows.map((row) =>
    [
      escapeCsv(formatDatePL(row.date)),
      escapeCsv(typeLabel(row.type)),
      escapeCsv(row.category_name),
      escapeCsv(row.name),
      escapeCsv(row.description),
      escapeCsv(moneyToPlainString(row.type === 'income' ? row.amount : -row.amount)),
      escapeCsv(row.payment_method),
      escapeCsv(row.type === 'bill' ? (row.is_paid === 1 ? 'Zapłacony' : 'Do zapłaty') : ''),
    ].join(';')
  );

  // ﻿ (BOM) sprawia, że Excel poprawnie odczytuje polskie znaki.
  const content = `﻿${header}\n${lines.join('\n')}\n`;
  const fileName = `budzet-transakcje-${todayISO()}.csv`;
  const uri = await writeAndShare(fileName, content, 'text/csv');
  return { uri, fileName };
}

/** Eksport surowych danych do JSON (bez nagłówka kopii zapasowej). */
export async function exportJson(): Promise<{ uri: string; fileName: string }> {
  const backup = await buildBackup();
  const fileName = `budzet-dane-${todayISO()}.json`;
  const uri = await writeAndShare(fileName, JSON.stringify(backup.data, null, 2), 'application/json');
  return { uri, fileName };
}

export interface RestorePreview {
  /** Zawartość pliku po walidacji. */
  backup: BackupFile;
  fileName: string;
  transactionCount: number;
  exportedAt: string;
}

function isBackupShape(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BackupFile>;
  if (!candidate.data || typeof candidate.data !== 'object') return false;
  return Array.isArray((candidate.data as Record<string, unknown>).transactions);
}

/**
 * Otwiera systemowy wybór pliku i sprawdza jego zawartość.
 * Zwraca null, gdy użytkownik anulował wybór.
 */
export async function pickBackupFile(): Promise<RestorePreview | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Plik nie jest poprawnym plikiem JSON.');
  }

  if (!isBackupShape(parsed)) {
    throw new Error('Plik nie wygląda na kopię zapasową tej aplikacji.');
  }

  return {
    backup: parsed,
    fileName: asset.name,
    transactionCount: parsed.data.transactions.length,
    exportedAt: parsed.exportedAt ?? '—',
  };
}

/**
 * Przywraca dane z kopii zapasowej.
 * UWAGA: operacja usuwa wszystkie bieżące dane — wywoływać wyłącznie po
 * potwierdzeniu przez użytkownika.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const db = await getDb();

  await wipeAllData();

  await db.withTransactionAsync(async () => {
    for (const table of TABLES) {
      const rows = (backup.data as Record<string, Record<string, unknown>[]>)[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((column) => {
          const value = row[column];
          if (value === undefined || value === null) return null;
          if (typeof value === 'boolean') return value ? 1 : 0;
          if (typeof value === 'number' || typeof value === 'string') return value;
          return String(value);
        });
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          values as (string | number | null)[]
        );
      }
    }
  });

  // Uzupełnia brakujące ustawienia i kategorie, gdyby plik był niekompletny.
  await seedDefaults(db);
}

/** Usuwa wszystkie dane użytkownika i przywraca stan początkowy. */
export async function resetEverything(): Promise<void> {
  const db = await getDb();
  await wipeAllData();
  await seedDefaults(db);
  await run("UPDATE settings SET value = '0' WHERE key = 'onboarding_done'");
}
