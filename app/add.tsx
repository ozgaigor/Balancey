import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountKeypad } from '../components/AmountKeypad';
import { Button } from '../components/Button';
import { CategoryButton } from '../components/CategoryButton';
import { DateField } from '../components/DateField';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { colors, font, radius, spacing, typeColor } from '../theme';
import type { PaymentMethod, TransactionType } from '../types';
import { digitsToGrosze, formatMoney } from '../utils/currency';
import { todayISO } from '../utils/dates';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { listCategoriesByUsage } from '../db/repositories/categories';
import { findHint } from '../db/repositories/hints';
import { listGoals } from '../db/repositories/savings';
import { getSetting, setSetting } from '../db/repositories/settings';
import { addTransaction } from '../services/transactionService';
import { notifyBudgetAlert } from '../services/notificationService';

const TYPE_OPTIONS: { value: TransactionType; label: string; color: string }[] = [
  { value: 'expense', label: 'Wydatek', color: colors.danger },
  { value: 'income', label: 'Przychód', color: colors.accent },
  { value: 'bill', label: 'Rachunek', color: colors.bills },
  { value: 'saving', label: 'Oszczędności', color: colors.savings },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Gotówka' },
  { value: 'card', label: 'Karta' },
  { value: 'blik', label: 'BLIK' },
  { value: 'transfer', label: 'Przelew' },
  { value: 'other', label: 'Inne' },
];

const ACTION_LABEL: Record<TransactionType, string> = {
  expense: 'Dodaj wydatek',
  income: 'Dodaj przychód',
  bill: 'Dodaj rachunek',
  saving: 'Dodaj oszczędności',
};

const TITLE: Record<TransactionType, string> = {
  expense: 'Nowy wydatek',
  income: 'Nowy przychód',
  bill: 'Nowy rachunek',
  saving: 'Nowa wpłata',
};

export default function AddTransactionScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, showToast, settings } = useApp();
  const params = useLocalSearchParams<{
    type?: string;
    name?: string;
    amount?: string;
    categoryId?: string;
    date?: string;
  }>();

  const initialType = (
    ['expense', 'income', 'bill', 'saving'].includes(params.type ?? '')
      ? params.type
      : 'expense'
  ) as TransactionType;

  const [type, setType] = useState<TransactionType>(initialType);
  const [digits, setDigits] = useState<string>(() => {
    const amount = Number.parseInt(params.amount ?? '', 10);
    return Number.isFinite(amount) && amount > 0 ? String(amount) : '';
  });
  const [name, setName] = useState<string>(params.name ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(() => {
    const parsed = Number.parseInt(params.categoryId ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [date, setDate] = useState<string>(params.date ?? todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [goalId, setGoalId] = useState<number | null>(null);
  const [billPaid, setBillPaid] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestedFromName, setSuggestedFromName] = useState<string | null>(null);

  const categoriesState = useDbData(() => listCategoriesByUsage(type), [type]);
  const goalsState = useDbData(() => listGoals(), []);

  const categories = useMemo(() => categoriesState.data ?? [], [categoriesState.data]);
  const goals = goalsState.data ?? [];
  const amount = digitsToGrosze(digits);

  // Zapamiętana kategoria — przy pierwszym wejściu podpowiadamy ostatnio używaną.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (params.categoryId) return;
      const stored = await getSetting(`last_category_${type}`);
      const parsed = Number.parseInt(stored ?? '', 10);
      if (!cancelled && Number.isFinite(parsed)) {
        setCategoryId((current) => current ?? parsed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, params.categoryId]);

  // Po zmianie typu czyścimy kategorię, bo należy do innego zestawu.
  const changeType = useCallback((next: TransactionType) => {
    setType(next);
    setCategoryId(null);
    setSuggestedFromName(null);
  }, []);

  /** Podpowiedź kategorii na podstawie nazwy ("Biedronka" -> Jedzenie). */
  const handleNameBlur = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const hint = await findHint(trimmed);
    if (hint && hint.categoryId != null && hint.type === type) {
      setCategoryId(hint.categoryId);
      setSuggestedFromName(hint.categoryName);
    }
  }, [name, type]);

  const visibleCategories = showAllCategories ? categories : categories.slice(0, 8);

  const canSave = amount > 0 && !saving;

  const handleSave = useCallback(async () => {
    if (amount <= 0) {
      showToast('Podaj kwotę większą od zera', 'warning');
      return;
    }

    setSaving(true);
    try {
      const result = await addTransaction({
        type,
        amount,
        categoryId,
        name: name.trim(),
        description: note.trim() || null,
        date,
        paymentMethod,
        isPaid: type === 'bill' ? billPaid : true,
        dueDate: type === 'bill' ? date : null,
        paidDate: type === 'bill' && billPaid ? date : null,
        goalId: type === 'saving' ? goalId : null,
      });

      if (categoryId != null) {
        await setSetting(`last_category_${type}`, categoryId);
      }

      refresh();
      showToast(result.message);

      if (settings.budgetAlertsEnabled && result.alerts.length > 0) {
        const alert = result.alerts[0];
        showToast(`${alert.title}. ${alert.body}`, alert.level === 'danger' ? 'error' : 'warning');
        if (settings.notificationsEnabled) {
          await notifyBudgetAlert(alert.title, alert.body);
        }
      }

      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Nie udało się zapisać', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    amount,
    billPaid,
    categoryId,
    date,
    goalId,
    name,
    note,
    paymentMethod,
    refresh,
    settings.budgetAlertsEnabled,
    settings.notificationsEnabled,
    showToast,
    type,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zamknij"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{TITLE[type]}</Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <SegmentedControl
          options={TYPE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            color: option.color,
          }))}
          value={type}
          onChange={(value) => changeType(value)}
        />

        <View style={styles.amountBox}>
          <Text
            style={[styles.amountText, { color: amount > 0 ? typeColor(type) : colors.textFaint }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            accessibilityLabel={`Kwota ${formatMoney(amount)}`}
          >
            {formatMoney(amount)}
          </Text>
        </View>

        <AmountKeypad digits={digits} onChange={setDigits} />

        <View style={styles.nameBox}>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              setSuggestedFromName(null);
            }}
            onBlur={handleNameBlur}
            placeholder={
              type === 'income' ? 'Źródło (opcjonalnie)' : 'Nazwa lub sklep (opcjonalnie)'
            }
            placeholderTextColor={colors.textFaint}
            style={styles.nameInput}
            selectionColor={colors.accent}
            returnKeyType="done"
            accessibilityLabel="Nazwa transakcji"
          />
          {suggestedFromName ? (
            <Text style={styles.suggestion}>Podpowiedziano kategorię: {suggestedFromName}</Text>
          ) : null}
        </View>

        <View style={styles.categorySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Kategoria</Text>
            {categories.length > 8 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAllCategories((value) => !value)}
              >
                <Text style={styles.link}>{showAllCategories ? 'Mniej' : 'Więcej'}</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.categoryGrid}>
            {visibleCategories.map((category) => (
              <CategoryButton
                key={category.id}
                name={category.name}
                icon={category.icon}
                color={category.color}
                selected={categoryId === category.id}
                onPress={() => {
                  setCategoryId((current) => (current === category.id ? null : category.id));
                  setSuggestedFromName(null);
                }}
              />
            ))}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setShowMore((value) => !value)}
          style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}
        >
          <Ionicons
            name={showMore ? 'chevron-up' : 'options-outline'}
            size={18}
            color={colors.textMuted}
          />
          <Text style={styles.moreToggleText}>
            {showMore ? 'Ukryj szczegóły' : 'Data, metoda płatności, notatka'}
          </Text>
        </Pressable>

        {showMore && (
          <View style={styles.moreBox}>
            <DateField
              label={type === 'bill' ? 'Termin płatności' : 'Data'}
              value={date}
              onChange={setDate}
            />

            {type !== 'income' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Metoda płatności</Text>
                <View style={styles.chipRow}>
                  {PAYMENT_METHODS.map((method) => (
                    <Pressable
                      key={method.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: paymentMethod === method.value }}
                      onPress={() =>
                        setPaymentMethod((current) =>
                          current === method.value ? null : method.value
                        )
                      }
                      style={({ pressed }) => [
                        styles.chip,
                        paymentMethod === method.value && styles.chipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          paymentMethod === method.value && styles.chipTextActive,
                        ]}
                      >
                        {method.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {type === 'bill' && (
              <View style={styles.switchRow}>
                <View style={styles.switchLabels}>
                  <Text style={styles.fieldLabel}>Zapłacony</Text>
                  <Text style={styles.fieldHint}>
                    Nieopłacone rachunki pokazują się jako „Do zapłaty”.
                  </Text>
                </View>
                <Switch
                  value={billPaid}
                  onValueChange={setBillPaid}
                  trackColor={{ false: colors.surfaceStrong, true: colors.accentDark }}
                  thumbColor={billPaid ? colors.accent : '#7A8794'}
                  accessibilityLabel="Rachunek zapłacony"
                />
              </View>
            )}

            {type === 'saving' && goals.length > 0 && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Cel oszczędnościowy</Text>
                <View style={styles.chipRow}>
                  {goals.map((goal) => (
                    <Pressable
                      key={goal.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: goalId === goal.id }}
                      onPress={() => setGoalId((current) => (current === goal.id ? null : goal.id))}
                      style={({ pressed }) => [
                        styles.chip,
                        goalId === goal.id && styles.chipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.chipText, goalId === goal.id && styles.chipTextActive]}>
                        {goal.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <TextField
              label="Notatka"
              value={note}
              onChangeText={setNote}
              placeholder="Opcjonalna notatka"
              multiline
            />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={ACTION_LABEL[type]}
          onPress={handleSave}
          disabled={!canSave}
          loading={saving}
          large
          icon="checkmark"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  amountBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  amountText: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1,
  },
  nameBox: { gap: spacing.xs },
  nameInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: font.body,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  suggestion: { color: colors.accent, fontSize: font.tiny, fontWeight: '600' },
  categorySection: { gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  link: { color: colors.accent, fontSize: font.small, fontWeight: '700' },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  moreToggleText: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  moreBox: { gap: spacing.lg },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  fieldHint: { color: colors.textFaint, fontSize: font.tiny, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  chipTextActive: { color: colors.text },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  switchLabels: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
