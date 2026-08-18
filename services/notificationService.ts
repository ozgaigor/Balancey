/**
 * Lokalne powiadomienia (bez żadnego serwera).
 *
 * Ograniczenie: w Expo Go powiadomienia lokalne działają, ale Expo Go nie
 * obsługuje pełnej konfiguracji kanałów i powiadomień push. Pełna obsługa
 * dostępna jest w zwykłym buildzie (APK/AAB) — tam nic nie trzeba zmieniać
 * w kodzie. Każde wywołanie jest zabezpieczone try/catch, więc brak
 * uprawnień nigdy nie psuje działania aplikacji.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { ISODate } from '../types';
import { formatMoney } from '../utils/currency';
import { addDays, formatDatePL, todayISO, toParts } from '../utils/dates';
import { listUnpaidBillsBetween } from '../db/repositories/transactions';

const CHANNEL_ID = 'budget';

/** Godzina wysyłki przypomnień o rachunkach. */
const REMINDER_HOUR = 9;
/** Godzina wieczornego przypomnienia o pozostałym budżecie. */
const DAILY_SUMMARY_HOUR = 20;

let handlerConfigured = false;

/** Ustawia sposób wyświetlania powiadomień, gdy aplikacja jest otwarta. */
export function configureNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Tworzy kanał powiadomień na Androidzie (wymagany od Androida 8). */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Budżet domowy',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#22C55E',
    });
  } catch {
    // Kanały nie są dostępne w Expo Go — powiadomienia trafią do kanału domyślnego.
  }
}

/** Prosi o zgodę na powiadomienia. Zwraca true, gdy zgoda została udzielona. */
export async function requestPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      await ensureChannel();
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    if (requested.granted) {
      await ensureChannel();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function hasPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.granted;
  } catch {
    return false;
  }
}

async function cancelByKind(kind: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if ((item.content.data as { kind?: string } | null)?.kind === kind) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch {
    // brak zaplanowanych powiadomień lub brak obsługi — pomijamy
  }
}

/** Buduje datę powiadomienia z daty ISO i godziny. */
function atHour(iso: ISODate, hour: number): Date {
  const { year, month, day } = toParts(iso);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

/**
 * Planuje przypomnienia o nieopłaconych rachunkach.
 * Przykład: "Jutro termin płatności za internet: 80,00 zł".
 */
export async function scheduleBillReminders(daysBefore = 1): Promise<number> {
  await cancelByKind('bill');

  try {
    const today = todayISO();
    const bills = await listUnpaidBillsBetween(today, addDays(today, 62));
    let scheduled = 0;

    for (const bill of bills) {
      const due = bill.dueDate ?? bill.date;
      const remindOn = addDays(due, -Math.max(0, daysBefore));
      const when = atHour(remindOn, REMINDER_HOUR);
      if (when.getTime() <= Date.now()) continue;

      const dayWord = daysBefore === 0 ? 'Dzisiaj' : daysBefore === 1 ? 'Jutro' : formatDatePL(due);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Termin płatności',
          body: `${dayWord} termin płatności: ${bill.name || 'rachunek'} — ${formatMoney(
            bill.amount
          )}.`,
          data: { kind: 'bill', transactionId: bill.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: CHANNEL_ID,
        },
      });
      scheduled += 1;
    }

    return scheduled;
  } catch {
    return 0;
  }
}

/**
 * Wieczorne przypomnienie o pozostałym budżecie na dziś.
 * Planowane po każdej zmianie danych, więc kwota jest zawsze aktualna.
 */
export async function scheduleDailyBudgetReminder(remainingBudget: number): Promise<void> {
  await cancelByKind('budget-daily');
  if (remainingBudget <= 0) return;

  try {
    const when = atHour(todayISO(), DAILY_SUMMARY_HOUR);
    if (when.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Budżet na dziś',
        body: `Masz jeszcze ${formatMoney(remainingBudget)} do wykorzystania w budżecie.`,
        data: { kind: 'budget-daily' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // pomijamy — powiadomienia są funkcją dodatkową
  }
}

/** Natychmiastowe powiadomienie o przekroczeniu limitu. */
export async function notifyBudgetAlert(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: 'budget-alert' } },
      trigger: null,
    });
  } catch {
    // brak zgody na powiadomienia — komunikat i tak pojawia się w aplikacji
  }
}

/** Usuwa wszystkie zaplanowane powiadomienia (wyłączenie funkcji w ustawieniach). */
export async function cancelAll(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // nic do anulowania
  }
}

/** Liczba zaplanowanych powiadomień — pokazywana w ustawieniach. */
export async function countScheduled(): Promise<number> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.length;
  } catch {
    return 0;
  }
}
