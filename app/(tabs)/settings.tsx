import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../components/Card';
import { ListRow } from '../../components/ListRow';
import { colors, font, radius, spacing } from '../../theme';
import { monthLabel } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { countTransactions } from '../../db/repositories/transactions';
import { setSetting } from '../../db/repositories/settings';
import {
  exportBackup,
  exportCsv,
  exportJson,
  pickBackupFile,
  resetEverything,
  restoreBackup,
} from '../../services/backupService';
import { loadDemoData, removeDemoData } from '../../services/demoService';
import { shareMonthPdf } from '../../services/pdfService';
import {
  cancelAll,
  countScheduled,
  requestPermission,
  scheduleBillReminders,
} from '../../services/notificationService';
import { getBiometricsStatus } from '../../services/lockService';

const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: 'PLN', symbol: 'zł', label: 'Złoty polski' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dolar amerykański' },
  { code: 'GBP', symbol: '£', label: 'Funt brytyjski' },
  { code: 'CZK', symbol: 'Kč', label: 'Korona czeska' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, reloadSettings, refresh, showToast, month, setUnlocked } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const countState = useDbData(() => countTransactions(), []);
  const scheduledState = useDbData(() => countScheduled(), []);
  const biometricsState = useDbData(() => getBiometricsStatus(), []);

  const transactionCount = countState.data ?? 0;
  const scheduled = scheduledState.data ?? 0;
  const biometrics = biometricsState.data;

  const runTask = useCallback(
    async (key: string, task: () => Promise<void>) => {
      setBusy(key);
      try {
        await task();
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Wystąpił błąd', 'error');
      } finally {
        setBusy(null);
      }
    },
    [showToast]
  );

  const handleNotificationsToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const granted = await requestPermission();
        if (!granted) {
          showToast('Brak zgody na powiadomienia w ustawieniach systemu', 'warning');
          return;
        }
        await setSetting('notifications_enabled', true);
        const count = await scheduleBillReminders(settings.billsReminderDays);
        showToast(
          count > 0 ? `Zaplanowano ${count} przypomnień o rachunkach` : 'Powiadomienia włączone'
        );
      } else {
        await setSetting('notifications_enabled', false);
        await cancelAll();
        showToast('Powiadomienia wyłączone');
      }
      await reloadSettings();
      refresh();
    },
    [refresh, reloadSettings, settings.billsReminderDays, showToast]
  );

  const handleReminderDays = useCallback(() => {
    Alert.alert('Przypomnienie o rachunku', 'Ile dni przed terminem przypominać?', [
      { text: 'W dniu terminu', onPress: () => saveReminderDays(0) },
      { text: '1 dzień wcześniej', onPress: () => saveReminderDays(1) },
      { text: '3 dni wcześniej', onPress: () => saveReminderDays(3) },
      { text: 'Anuluj', style: 'cancel' },
    ]);

    async function saveReminderDays(days: number) {
      await setSetting('bills_reminder_days', days);
      await reloadSettings();
      if (settings.notificationsEnabled) {
        await scheduleBillReminders(days);
      }
      showToast('Zapisano ustawienie przypomnień');
      refresh();
    }
  }, [refresh, reloadSettings, settings.notificationsEnabled, showToast]);

  const handleDemo = useCallback(() => {
    if (settings.demoDataLoaded) {
      Alert.alert(
        'Usunąć dane demonstracyjne?',
        'Usuniemy wpisy demo oraz budżet i plan miesiąca, które powstały razem z nimi. Pozostałe Twoje dane zostaną nienaruszone.',
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Usuń',
            style: 'destructive',
            onPress: () =>
              runTask('demo', async () => {
                await removeDemoData();
                await reloadSettings();
                refresh();
                showToast('Usunięto dane demonstracyjne');
              }),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Wgrać przykładowy miesiąc?',
      'Dodamy przykładowe przychody, rachunki, wydatki i cel oszczędnościowy. W każdej chwili możesz je usunąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wgraj',
          onPress: () =>
            runTask('demo', async () => {
              await loadDemoData();
              await reloadSettings();
              refresh();
              showToast('Wgrano przykładowe dane');
            }),
        },
      ]
    );
  }, [refresh, reloadSettings, runTask, settings.demoDataLoaded, showToast]);

  const handleRestore = useCallback(() => {
    runTask('restore', async () => {
      const preview = await pickBackupFile();
      if (!preview) return;

      Alert.alert(
        'Przywrócić kopię zapasową?',
        `Plik: ${preview.fileName}\nTransakcje w pliku: ${preview.transactionCount}\n\nUWAGA: wszystkie obecne dane w aplikacji zostaną zastąpione danymi z pliku.`,
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Przywróć',
            style: 'destructive',
            onPress: () =>
              runTask('restore', async () => {
                await restoreBackup(preview.backup);
                await reloadSettings();
                refresh();
                showToast('Przywrócono kopię zapasową');
              }),
          },
        ]
      );
    });
  }, [refresh, reloadSettings, runTask, showToast]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Usunąć wszystkie dane?',
      'Zostaną skasowane wszystkie transakcje, budżety, cele i ustawienia. Tej operacji nie można cofnąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń wszystko',
          style: 'destructive',
          onPress: () =>
            runTask('reset', async () => {
              await resetEverything();
              await reloadSettings();
              refresh();
              showToast('Dane zostały usunięte');
            }),
        },
      ]
    );
  }, [refresh, reloadSettings, runTask, showToast]);

  const selectCurrency = useCallback(
    async (code: string, symbol: string) => {
      await setSetting('currency', code);
      await setSetting('currency_symbol', symbol);
      await reloadSettings();
      setCurrencyOpen(false);
      showToast(`Waluta: ${code}`);
      refresh();
    },
    [refresh, reloadSettings, showToast]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: 150 }]}
    >
      <Text style={styles.title}>Ustawienia</Text>

      <Card title="Dane">
        <ListRow
          icon="pricetags-outline"
          iconColor={colors.accent}
          title="Kategorie"
          subtitle="Dodawaj, zmieniaj i usuwaj kategorie"
          onPress={() => router.push('/categories')}
        />
        <ListRow
          icon="repeat-outline"
          iconColor={colors.bills}
          title="Rachunki i wydatki cykliczne"
          subtitle="Automatyczne pozycje co miesiąc"
          onPress={() => router.push('/recurring')}
        />
        <ListRow
          icon="flag-outline"
          iconColor={colors.savings}
          title="Cele oszczędnościowe"
          onPress={() => router.push('/savings')}
        />
        <ListRow
          icon="clipboard-outline"
          iconColor={colors.warning}
          title="Plan miesiąca"
          subtitle="Porównanie planu z rzeczywistością"
          onPress={() => router.push('/plan')}
        />
      </Card>

      <Card title="Eksport i kopia zapasowa">
        <ListRow
          icon="document-text-outline"
          iconColor={colors.danger}
          title={`PDF — ${monthLabel(month)}`}
          subtitle="Podsumowanie miesiąca w formacie A5"
          onPress={() =>
            runTask('pdf', async () => {
              const result = await shareMonthPdf(month);
              showToast(`Zapisano ${result.fileName}`);
            })
          }
        />
        <ListRow
          icon="grid-outline"
          iconColor={colors.accent}
          title="Eksport wszystkich transakcji do CSV"
          onPress={() =>
            runTask('csv', async () => {
              const result = await exportCsv();
              showToast(`Zapisano ${result.fileName}`);
            })
          }
        />
        <ListRow
          icon="code-slash-outline"
          iconColor={colors.bills}
          title="Eksport danych do JSON"
          onPress={() =>
            runTask('json', async () => {
              const result = await exportJson();
              showToast(`Zapisano ${result.fileName}`);
            })
          }
        />
        <ListRow
          icon="cloud-download-outline"
          iconColor={colors.savings}
          title="Utwórz kopię zapasową"
          subtitle={`${transactionCount} transakcji w bazie`}
          onPress={() =>
            runTask('backup', async () => {
              const result = await exportBackup();
              showToast(`Kopia zapisana: ${result.fileName}`);
            })
          }
        />
        <ListRow
          icon="cloud-upload-outline"
          iconColor={colors.warning}
          title="Przywróć kopię zapasową"
          subtitle="Zastąpi obecne dane danymi z pliku"
          onPress={handleRestore}
        />
      </Card>

      <Card title="Powiadomienia">
        <ListRow
          icon="notifications-outline"
          iconColor={colors.accent}
          title="Przypomnienia o rachunkach"
          subtitle={
            settings.notificationsEnabled
              ? `Zaplanowane powiadomienia: ${scheduled}`
              : 'Lokalne powiadomienia, bez żadnego serwera'
          }
          switchValue={settings.notificationsEnabled}
          onSwitchChange={handleNotificationsToggle}
        />
        <ListRow
          icon="alarm-outline"
          iconColor={colors.bills}
          title="Kiedy przypominać"
          value={
            settings.billsReminderDays === 0
              ? 'W dniu terminu'
              : `${settings.billsReminderDays} dni wcześniej`
          }
          onPress={handleReminderDays}
        />
        <ListRow
          icon="warning-outline"
          iconColor={colors.warning}
          title="Ostrzeżenia o budżecie"
          subtitle="Komunikat przy 80% limitu i po przekroczeniu"
          switchValue={settings.budgetAlertsEnabled}
          onSwitchChange={async (value) => {
            await setSetting('budget_alerts_enabled', value);
            await reloadSettings();
          }}
        />
      </Card>

      <Card title="Bezpieczeństwo">
        <ListRow
          icon="lock-closed-outline"
          iconColor={colors.accent}
          title="Blokada kodem PIN"
          subtitle={settings.lockEnabled ? 'Włączona' : 'Wyłączona'}
          value={settings.lockEnabled ? 'Zmień' : 'Ustaw'}
          onPress={() => router.push('/security')}
        />
        {settings.lockEnabled && biometrics?.available && biometrics.enrolled && (
          <ListRow
            icon="finger-print-outline"
            iconColor={colors.savings}
            title={`Odblokowanie: ${biometrics.label}`}
            switchValue={settings.biometricsEnabled}
            onSwitchChange={async (value) => {
              await setSetting('biometrics_enabled', value);
              await reloadSettings();
            }}
          />
        )}
        {settings.lockEnabled && (
          <ListRow
            icon="log-out-outline"
            iconColor={colors.textMuted}
            title="Zablokuj teraz"
            onPress={() => setUnlocked(false)}
          />
        )}
      </Card>

      <Card title="Aplikacja">
        <ListRow
          icon="cash-outline"
          iconColor={colors.accent}
          title="Waluta"
          subtitle="Kwoty są formatowane po polsku"
          value={`${settings.currency} (${settings.currencySymbol})`}
          onPress={() => setCurrencyOpen(true)}
        />
        <ListRow
          icon="sparkles-outline"
          iconColor={colors.warning}
          title={settings.demoDataLoaded ? 'Usuń dane demonstracyjne' : 'Wgraj przykładowy miesiąc'}
          subtitle={settings.demoDataLoaded ? 'Dane demo są aktywne' : 'Zobacz, jak działa aplikacja'}
          onPress={handleDemo}
        />
        <ListRow
          icon="refresh-outline"
          iconColor={colors.bills}
          title="Uruchom ponownie konfigurację"
          subtitle="Ekran powitalny przy następnym otwarciu"
          onPress={() =>
            runTask('onboarding', async () => {
              await setSetting('onboarding_done', false);
              await reloadSettings();
              showToast('Konfiguracja zostanie pokazana ponownie');
            })
          }
        />
        <ListRow
          icon="trash-outline"
          title="Usuń wszystkie dane"
          subtitle="Kasuje transakcje, budżety i ustawienia"
          danger
          onPress={handleReset}
        />
      </Card>

      <Card title="Prywatność">
        <View style={styles.privacyBox}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
          <Text style={styles.privacyText}>
            Wszystkie dane finansowe są zapisywane wyłącznie na tym urządzeniu, w lokalnej bazie
            SQLite. Aplikacja nie ma kont użytkowników, nie wysyła danych do internetu i nie zawiera
            reklam ani analityki. Pliki PDF, CSV i kopie zapasowe powstają lokalnie — to Ty
            decydujesz, komu je udostępnisz.
          </Text>
        </View>
      </Card>

      <Text style={styles.version}>Budżet domowy · wersja 1.0.0</Text>

      {busy && (
        <View style={styles.busyOverlay} pointerEvents="none">
          <Text style={styles.busyText}>Pracuję…</Text>
        </View>
      )}

      <Modal
        visible={currencyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCurrencyOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>Waluta</Text>
            {CURRENCIES.map((currency) => (
              <Pressable
                key={currency.code}
                accessibilityRole="button"
                onPress={() => selectCurrency(currency.code, currency.symbol)}
                style={({ pressed }) => [styles.currencyRow, pressed && styles.pressed]}
              >
                <Text style={styles.currencyCode}>
                  {currency.code} ({currency.symbol})
                </Text>
                <Text style={styles.currencyLabel}>{currency.label}</Text>
                {settings.currency === currency.code && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                )}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  title: { color: colors.text, fontSize: font.h1, fontWeight: '700' },
  privacyBox: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  privacyText: { flex: 1, color: colors.textMuted, fontSize: font.tiny, lineHeight: 18 },
  version: { color: colors.textFaint, fontSize: font.tiny, textAlign: 'center' },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  busyText: {
    backgroundColor: colors.surfaceStrong,
    color: colors.text,
    fontSize: font.tiny,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700', marginBottom: spacing.sm },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  currencyCode: { color: colors.text, fontSize: font.small, fontWeight: '700', width: 96 },
  currencyLabel: { flex: 1, color: colors.textMuted, fontSize: font.tiny },
  pressed: { opacity: 0.7 },
});
