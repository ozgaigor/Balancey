/**
 * Globalny stan aplikacji: ustawienia, wybrany miesiąc, sygnał odświeżenia
 * danych, komunikaty potwierdzeń oraz stan blokady PIN.
 *
 * Logika biznesowa nie mieszka tutaj — provider jedynie spina warstwę danych
 * z interfejsem.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { AppSettings } from '../types';
import { addMonths, currentYearMonth } from '../utils/dates';
import { getDb } from '../db/database';
import { getSettings } from '../db/repositories/settings';
import { catchUpRecurring } from '../services/recurringService';
import { configureNotificationHandler, scheduleBillReminders } from '../services/notificationService';

export type ToastVariant = 'success' | 'error' | 'warning';

export interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

interface AppContextValue {
  /** Czy baza danych jest gotowa do użycia. */
  ready: boolean;
  initError: string | null;
  settings: AppSettings;
  reloadSettings: () => Promise<AppSettings>;

  /** Miesiąc wybrany na ekranach Start / Budżet / Statystyki. */
  month: string;
  setMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;

  /** Numer wersji danych — zmiana wymusza ponowne pobranie z bazy. */
  dataVersion: number;
  refresh: () => void;

  toast: ToastMessage | null;
  showToast: (text: string, variant?: ToastVariant) => void;
  hideToast: () => void;

  /** Blokada PIN. */
  unlocked: boolean;
  setUnlocked: (value: boolean) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'PLN',
  currencySymbol: 'zł',
  onboardingDone: false,
  defaultBudget: 0,
  defaultSaving: 0,
  savingPercent: 0,
  lockEnabled: false,
  biometricsEnabled: false,
  pinHash: null,
  pinSalt: null,
  notificationsEnabled: false,
  billsReminderDays: 1,
  budgetAlertsEnabled: true,
  demoDataLoaded: false,
};

const AppContext = createContext<AppContextValue | null>(null);

/** Po ilu sekundach w tle aplikacja prosi ponownie o PIN. */
const RELOCK_AFTER_MS = 30_000;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [month, setMonth] = useState<string>(() => currentYearMonth());
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const toastId = useRef(0);
  const backgroundedAt = useRef<number | null>(null);

  const reloadSettings = useCallback(async () => {
    const loaded = await getSettings();
    setSettings(loaded);
    return loaded;
  }, []);

  const refresh = useCallback(() => {
    setDataVersion((value) => value + 1);
  }, []);

  const showToast = useCallback((text: string, variant: ToastVariant = 'success') => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, variant });
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  // Start aplikacji: baza, ustawienia, transakcje cykliczne, powiadomienia.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        configureNotificationHandler();
        await getDb();
        const loaded = await getSettings();
        if (cancelled) return;

        setSettings(loaded);
        setUnlocked(!(loaded.lockEnabled && loaded.pinHash != null));

        const created = await catchUpRecurring();
        if (created > 0 && !cancelled) {
          setDataVersion((value) => value + 1);
        }

        if (loaded.notificationsEnabled) {
          await scheduleBillReminders(loaded.billsReminderDays);
        }
      } catch (error) {
        if (!cancelled) {
          setInitError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Ponowne zablokowanie po powrocie z tła.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'background' || status === 'inactive') {
        backgroundedAt.current = Date.now();
        return;
      }

      if (status === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (
          since != null &&
          Date.now() - since > RELOCK_AFTER_MS &&
          settings.lockEnabled &&
          settings.pinHash != null
        ) {
          setUnlocked(false);
        }
      }
    });

    return () => subscription.remove();
  }, [settings.lockEnabled, settings.pinHash]);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      initError,
      settings,
      reloadSettings,
      month,
      setMonth,
      goToPreviousMonth: () => setMonth((current) => addMonths(current, -1)),
      goToNextMonth: () => setMonth((current) => addMonths(current, 1)),
      goToCurrentMonth: () => setMonth(currentYearMonth()),
      dataVersion,
      refresh,
      toast,
      showToast,
      hideToast,
      unlocked,
      setUnlocked,
    }),
    [ready, initError, settings, reloadSettings, month, dataVersion, refresh, toast, showToast, hideToast, unlocked]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp musi być użyte wewnątrz AppProvider');
  }
  return context;
}
