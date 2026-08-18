import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, spacing } from '../theme';
import { formatMoney, parseAmount } from '../utils/currency';
import { currentYearMonth, todayISO } from '../utils/dates';
import { useApp } from '../state/AppProvider';
import { findCategoryByName } from '../db/repositories/categories';
import { setMonthBudget } from '../db/repositories/budgets';
import { savePlan } from '../db/repositories/plans';
import { createRecurring } from '../db/repositories/recurring';
import { createTransaction } from '../db/repositories/transactions';
import { setSetting } from '../db/repositories/settings';
import { ensureRecurringForMonth } from '../services/recurringService';
import { loadDemoData } from '../services/demoService';
import { Button } from './Button';
import { TextField } from './TextField';

const CURRENCIES = [
  { code: 'PLN', symbol: 'zł', label: 'Polski złoty' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dolar' },
];

interface BillDraft {
  name: string;
  categoryName: string;
  icon: keyof typeof Ionicons.glyphMap;
  day: number;
  amount: string;
}

const DEFAULT_BILLS: BillDraft[] = [
  { name: 'Czynsz', categoryName: 'Czynsz', icon: 'business-outline', day: 1, amount: '' },
  { name: 'Prąd', categoryName: 'Prąd', icon: 'flash-outline', day: 10, amount: '' },
  { name: 'Internet', categoryName: 'Internet', icon: 'wifi-outline', day: 10, amount: '' },
  { name: 'Telefon', categoryName: 'Telefon', icon: 'call-outline', day: 15, amount: '' },
];

const STEPS = ['Waluta', 'Dochód', 'Rachunki', 'Budżet'] as const;

/** Krótka konfiguracja pokazywana przy pierwszym uruchomieniu. */
export function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const { reloadSettings, refresh, showToast } = useApp();

  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [income, setIncome] = useState('');
  const [bills, setBills] = useState<BillDraft[]>(DEFAULT_BILLS);
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = useCallback(
    async (options: { withDemo?: boolean } = {}) => {
      setBusy(true);
      try {
        const month = currentYearMonth();

        await setSetting('currency', currency.code);
        await setSetting('currency_symbol', currency.symbol);

        const incomeAmount = parseAmount(income);
        if (incomeAmount != null && incomeAmount > 0) {
          const category = await findCategoryByName('Pensja', 'income');
          await createTransaction({
            type: 'income',
            amount: incomeAmount,
            categoryId: category?.id ?? null,
            name: 'Pensja',
            date: todayISO(),
          });
          await savePlan(month, {
            plannedIncome: incomeAmount,
            plannedBills: 0,
            plannedExpenses: 0,
            plannedSavings: 0,
          });
        }

        for (const bill of bills) {
          const amount = parseAmount(bill.amount);
          if (amount == null || amount <= 0) continue;
          const category = await findCategoryByName(bill.categoryName, 'bill');
          await createRecurring({
            type: 'bill',
            name: bill.name,
            amount,
            categoryId: category?.id ?? null,
            dayOfMonth: bill.day,
            startMonth: month,
          });
        }
        await ensureRecurringForMonth(month);

        const budgetAmount = parseAmount(budget);
        if (budgetAmount != null && budgetAmount > 0) {
          await setMonthBudget(month, budgetAmount, true);
        }

        if (options.withDemo) {
          await loadDemoData();
        }

        await setSetting('onboarding_done', true);
        await reloadSettings();
        refresh();
        showToast('Gotowe. Możesz dodawać wydatki.');
      } finally {
        setBusy(false);
      }
    },
    [bills, budget, currency, income, refresh, reloadSettings, showToast]
  );

  const skip = useCallback(async () => {
    setBusy(true);
    try {
      await setSetting('onboarding_done', true);
      await reloadSettings();
      refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, reloadSettings]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="wallet-outline" size={24} color={colors.accent} />
          </View>
          <Text style={styles.title}>Budżet domowy</Text>
          <Text style={styles.subtitle}>
            Krótka konfiguracja — zajmie chwilę. Każdy krok możesz pominąć.
          </Text>
        </View>

        <View style={styles.steps}>
          {STEPS.map((label, index) => (
            <View
              key={label}
              style={[styles.stepDot, index <= step && styles.stepDotActive]}
              accessibilityLabel={`Krok ${index + 1}: ${label}`}
            />
          ))}
        </View>

        {step === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Jaka waluta?</Text>
            <Text style={styles.cardText}>
              Kwoty formatowane są po polsku: 1 000,00 {currency.symbol}.
            </Text>
            <View style={styles.currencyRow}>
              {CURRENCIES.map((item) => (
                <Pressable
                  key={item.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: currency.code === item.code }}
                  onPress={() => setCurrency(item)}
                  style={({ pressed }) => [
                    styles.currencyChip,
                    currency.code === item.code && styles.currencyChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.currencyCode,
                      currency.code === item.code && styles.currencyCodeActive,
                    ]}
                  >
                    {item.code}
                  </Text>
                  <Text style={styles.currencyLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Miesięczny dochód</Text>
            <Text style={styles.cardText}>
              Opcjonalnie. Zapiszemy go jako przychód w bieżącym miesiącu — zawsze możesz to zmienić.
            </Text>
            <TextField
              label="Kwota"
              value={income}
              onChangeText={setIncome}
              keyboardType="decimal-pad"
              suffix={currency.symbol}
              placeholder="np. 5 000"
              hint={parseAmount(income) != null ? formatMoney(parseAmount(income) as number) : undefined}
            />
          </View>
        )}

        {step === 2 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Podstawowe rachunki</Text>
            <Text style={styles.cardText}>
              Opcjonalnie. Wpisane kwoty utworzą rachunki cykliczne — będą pojawiać się co miesiąc.
            </Text>
            <View style={styles.billList}>
              {bills.map((bill, index) => (
                <View key={bill.name} style={styles.billRow}>
                  <View style={styles.billIcon}>
                    <Ionicons name={bill.icon} size={18} color={colors.bills} />
                  </View>
                  <View style={styles.billField}>
                    <TextField
                      label={`${bill.name} · ${bill.day} dnia miesiąca`}
                      value={bill.amount}
                      onChangeText={(value) =>
                        setBills((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, amount: value } : item
                          )
                        )
                      }
                      keyboardType="decimal-pad"
                      suffix={currency.symbol}
                      placeholder="0,00"
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Budżet na wydatki</Text>
            <Text style={styles.cardText}>
              Opcjonalnie. Dzięki limitowi aplikacja policzy, ile możesz wydać dziennie do końca
              miesiąca. Kategorie wydatków są już gotowe — zmienisz je w Ustawieniach.
            </Text>
            <TextField
              label="Miesięczny limit wydatków"
              value={budget}
              onChangeText={setBudget}
              keyboardType="decimal-pad"
              suffix={currency.symbol}
              placeholder="np. 3 000"
              hint={parseAmount(budget) != null ? formatMoney(parseAmount(budget) as number) : undefined}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => finish({ withDemo: true })}
              disabled={busy}
              style={({ pressed }) => [styles.demoBox, pressed && styles.pressed]}
            >
              <Ionicons name="sparkles-outline" size={18} color={colors.warning} />
              <Text style={styles.demoText}>
                Wgraj też przykładowy miesiąc, aby zobaczyć jak działa aplikacja
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.actions}>
          {step > 0 && (
            <Button
              label="Wstecz"
              variant="secondary"
              onPress={() => setStep((value) => Math.max(0, value - 1))}
              style={styles.action}
            />
          )}
          {step < STEPS.length - 1 ? (
            <Button
              label="Dalej"
              onPress={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
              style={styles.action}
            />
          ) : (
            <Button
              label="Zaczynamy"
              icon="checkmark"
              onPress={() => finish()}
              loading={busy}
              style={styles.action}
            />
          )}
        </View>

        <Pressable accessibilityRole="button" onPress={skip} disabled={busy} style={styles.skip}>
          <Text style={styles.skipText}>Pomiń konfigurację</Text>
        </Pressable>

        <Text style={styles.privacy}>
          Dane zostają na telefonie. Brak konta, brak logowania, brak wysyłania danych do internetu.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 150,
  },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: font.h1, fontWeight: '800' },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.small,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
  steps: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  stepDot: {
    width: 34,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceStrong,
  },
  stepDotActive: { backgroundColor: colors.accent },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  cardText: { color: colors.textMuted, fontSize: font.small, lineHeight: 20 },
  currencyRow: { gap: spacing.sm },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  currencyChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  currencyCode: { color: colors.textMuted, fontSize: font.body, fontWeight: '800', width: 56 },
  currencyCodeActive: { color: colors.text },
  currencyLabel: { color: colors.textMuted, fontSize: font.small },
  billList: { gap: spacing.md },
  billRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  billIcon: {
    width: 42,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billField: { flex: 1 },
  demoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  demoText: { flex: 1, color: colors.warning, fontSize: font.tiny, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  skip: { alignItems: 'center', paddingVertical: spacing.sm, minHeight: 44, justifyContent: 'center' },
  skipText: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  privacy: {
    color: colors.textFaint,
    fontSize: font.tiny,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.lg,
  },
});
