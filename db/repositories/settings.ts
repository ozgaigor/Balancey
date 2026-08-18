/** Repozytorium ustawień (tabela klucz -> wartość). */

import type { AppSettings } from '../../types';
import { DEFAULT_SETTINGS } from '../migrations';
import { query, queryFirst, run } from '../database';

interface SettingRow {
  key: string;
  value: string;
}

function toBool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return value === '1' || value === 'true';
}

function toInt(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Wszystkie ustawienia jako surowa mapa. */
export async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await query<SettingRow>('SELECT key, value FROM settings');
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

/** Ustawienia w postaci obiektu z typami. */
export async function getSettings(): Promise<AppSettings> {
  const map = await getSettingsMap();
  return {
    currency: map.currency ?? 'PLN',
    currencySymbol: map.currency_symbol ?? 'zł',
    onboardingDone: toBool(map.onboarding_done),
    defaultBudget: toInt(map.default_budget),
    defaultSaving: toInt(map.default_saving),
    savingPercent: toInt(map.saving_percent),
    lockEnabled: toBool(map.lock_enabled),
    biometricsEnabled: toBool(map.biometrics_enabled),
    pinHash: map.pin_hash ?? null,
    pinSalt: map.pin_salt ?? null,
    notificationsEnabled: toBool(map.notifications_enabled),
    billsReminderDays: toInt(map.bills_reminder_days, 1),
    budgetAlertsEnabled: toBool(map.budget_alerts_enabled, true),
    demoDataLoaded: toBool(map.demo_data_loaded),
  };
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await queryFirst<SettingRow>('SELECT key, value FROM settings WHERE key = ?', [key]);
  return row?.value ?? DEFAULT_SETTINGS[key] ?? null;
}

export async function setSetting(key: string, value: string | number | boolean): Promise<void> {
  const stringValue =
    typeof value === 'boolean' ? (value ? '1' : '0') : typeof value === 'number' ? String(value) : value;
  await run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, stringValue]
  );
}

export async function setSettings(values: Record<string, string | number | boolean>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await setSetting(key, value);
  }
}

export async function deleteSetting(key: string): Promise<void> {
  await run('DELETE FROM settings WHERE key = ?', [key]);
}
