import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountPrompt } from '../../components/AmountPrompt';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { MonthSelector } from '../../components/MonthSelector';
import { ProgressBar } from '../../components/ProgressBar';
import { colors, font, radius, spacing } from '../../theme';
import { savingFromPercent } from '../../utils/calculations';
import { formatMoney } from '../../utils/currency';
import { monthLabel } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { listCategories } from '../../db/repositories/categories';
import { setCategoryBudget, setMonthBudget } from '../../db/repositories/budgets';
import { setSetting } from '../../db/repositories/settings';
import { getMonthOverview } from '../../services/budgetService';

type PromptTarget =
  | { kind: 'month-budget' }
  | { kind: 'category'; categoryId: number; name: string; current: number }
  | { kind: 'default-saving' }
  | { kind: 'saving-percent' };

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const { month, goToPreviousMonth, goToNextMonth, goToCurrentMonth, refresh, showToast, settings, reloadSettings } =
    useApp();

  const [prompt, setPrompt] = useState<PromptTarget | null>(null);
  const [applyToNextMonths, setApplyToNextMonths] = useState(true);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const overviewState = useDbData(() => getMonthOverview(month), [month]);
  const categoriesState = useDbData(() => listCategories('expense'), []);

  const overview = overviewState.data;
  const categories = categoriesState.data ?? [];

  const handleConfirm = useCallback(
    async (amount: number) => {
      if (!prompt) return;

      if (prompt.kind === 'month-budget') {
        await setMonthBudget(month, amount, applyToNextMonths);
        showToast(amount > 0 ? `Budżet: ${formatMoney(amount)}` : 'Budżet usunięty');
      } else if (prompt.kind === 'category') {
        await setCategoryBudget(prompt.categoryId, amount);
        showToast(
          amount > 0 ? `Limit ${prompt.name}: ${formatMoney(amount)}` : `Limit ${prompt.name} usunięty`
        );
      } else if (prompt.kind === 'default-saving') {
        await setSetting('default_saving', amount);
        showToast('Zapisano domyślną kwotę oszczędności');
      } else if (prompt.kind === 'saving-percent') {
        // Kwota wpisywana jest w groszach, procent bierzemy z części całkowitej.
        const percent = Math.max(0, Math.min(100, Math.round(amount / 100)));
        await setSetting('saving_percent', percent);
        showToast(percent > 0 ? `Oszczędności: ${percent}% dochodu` : 'Wyłączono procent oszczędności');
      }

      setPrompt(null);
      await reloadSettings();
      refresh();
    },
    [applyToNextMonths, month, prompt, refresh, reloadSettings, showToast]
  );

  const budget = overview?.budget;
  const plannedSaving =
    settings.savingPercent > 0 && overview
      ? savingFromPercent(overview.summary.income, settings.savingPercent)
      : settings.defaultSaving;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: 150 }]}
    >
      <MonthSelector
        month={month}
        onPrevious={goToPreviousMonth}
        onNext={goToNextMonth}
        onPressLabel={goToCurrentMonth}
      />

      <Card title={`Budżet wydatków — ${monthLabel(month)}`}>
        {budget?.hasLimit ? (
          <View style={styles.budgetBlock}>
            <View style={styles.amountRow}>
              <View>
                <Text style={styles.amountLabel}>Wydano</Text>
                <Text style={styles.amountValue}>{formatMoney(budget.spent)}</Text>
              </View>
              <View style={styles.amountRight}>
                <Text style={styles.amountLabel}>
                  {budget.exceeded ? 'Przekroczono o' : 'Pozostało'}
                </Text>
                <Text
                  style={[styles.amountValue, budget.exceeded ? styles.danger : styles.accent]}
                >
                  {formatMoney(Math.abs(budget.left))}
                </Text>
              </View>
            </View>

            <ProgressBar percent={budget.barPercent} exceeded={budget.exceeded} height={14} />

            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {budget.percent}% z {formatMoney(budget.limit)}
              </Text>
              {overview != null && overview.daysLeft > 0 && (
                <Text style={styles.meta}>
                  {overview.dailyLimit > 0
                    ? `${formatMoney(overview.dailyLimit)} / dzień przez ${overview.daysLeft} dni`
                    : `Zostało ${overview.daysLeft} dni`}
                </Text>
              )}
            </View>

            {budget.exceeded && (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={18} color={colors.danger} />
                <Text style={styles.warningText}>
                  Budżet przekroczony o {formatMoney(Math.abs(budget.left))}. Ogranicz wydatki lub
                  zwiększ limit.
                </Text>
              </View>
            )}

            {budget.fromDefault && (
              <Text style={styles.hint}>
                Używany jest budżet domyślny. Zmiana zapisze limit dla tego miesiąca.
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => setPrompt({ kind: 'month-budget' })}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={18} color={colors.accent} />
              <Text style={styles.editButtonText}>Zmień budżet miesięczny</Text>
            </Pressable>
          </View>
        ) : (
          <EmptyState
            icon="pie-chart-outline"
            title="Brak budżetu na ten miesiąc"
            description="Ustaw miesięczny limit wydatków, aby aplikacja liczyła pozostałą kwotę i limit dzienny."
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => setPrompt({ kind: 'month-budget' })}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Ustaw budżet</Text>
            </Pressable>
          </EmptyState>
        )}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Stosuj ten budżet w kolejnych miesiącach</Text>
          <Switch
            value={applyToNextMonths}
            onValueChange={setApplyToNextMonths}
            trackColor={{ false: colors.surfaceStrong, true: colors.accentDark }}
            thumbColor={applyToNextMonths ? colors.accent : '#7A8794'}
            accessibilityLabel="Stosuj budżet w kolejnych miesiącach"
          />
        </View>
      </Card>

      <Card
        title="Limity kategorii"
        action={
          <Pressable accessibilityRole="button" onPress={() => setShowCategoryPicker((v) => !v)}>
            <Text style={styles.link}>{showCategoryPicker ? 'Zamknij' : 'Dodaj limit'}</Text>
          </Pressable>
        }
      >
        {showCategoryPicker && (
          <View style={styles.pickerBox}>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                onPress={() => {
                  setShowCategoryPicker(false);
                  const existing = overview?.categoryBudgets.find(
                    (item) => item.categoryId === category.id
                  );
                  setPrompt({
                    kind: 'category',
                    categoryId: category.id,
                    name: category.name,
                    current: existing?.limit ?? 0,
                  });
                }}
                style={({ pressed }) => [styles.pickerChip, pressed && styles.pressed]}
              >
                <Ionicons
                  name={category.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={category.color}
                />
                <Text style={styles.pickerChipText}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {overview && overview.categoryBudgets.length > 0 ? (
          <View style={styles.categoryList}>
            {overview.categoryBudgets.map((item) => (
              <Pressable
                key={item.categoryId}
                accessibilityRole="button"
                accessibilityLabel={`Limit ${item.name}: ${formatMoney(item.total)} z ${formatMoney(item.limit)}`}
                onPress={() =>
                  setPrompt({
                    kind: 'category',
                    categoryId: item.categoryId as number,
                    name: item.name,
                    current: item.limit,
                  })
                }
                style={({ pressed }) => [styles.categoryRow, pressed && styles.pressed]}
              >
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryName}>
                    <Ionicons
                      name={item.icon as keyof typeof Ionicons.glyphMap}
                      size={16}
                      color={item.color}
                    />
                    <Text style={styles.categoryLabel}>{item.name}</Text>
                  </View>
                  <Text style={[styles.categoryValue, item.exceeded && styles.danger]}>
                    {formatMoney(item.total)} / {formatMoney(item.limit)}
                  </Text>
                </View>
                <ProgressBar
                  percent={item.barPercent}
                  color={item.color}
                  exceeded={item.exceeded}
                  height={8}
                />
                {item.exceeded && (
                  <Text style={styles.categoryWarning}>
                    Przekroczono o {formatMoney(item.total - item.limit)}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>
            Brak limitów kategorii. Dodaj limit, aby pilnować np. wydatków na jedzenie.
          </Text>
        )}
      </Card>

      <Card title="Ustawienia budżetu">
        <ListRow
          icon="wallet-outline"
          iconColor={colors.savings}
          title="Domyślna kwota oszczędności"
          subtitle="Podpowiadana przy planowaniu miesiąca"
          value={settings.defaultSaving > 0 ? formatMoney(settings.defaultSaving) : 'Brak'}
          onPress={() => setPrompt({ kind: 'default-saving' })}
        />
        <ListRow
          icon="trending-up-outline"
          iconColor={colors.accent}
          title="Procent dochodu na oszczędności"
          subtitle={
            settings.savingPercent > 0
              ? `Przy obecnych przychodach: ${formatMoney(plannedSaving)}`
              : 'Wyłączone'
          }
          value={settings.savingPercent > 0 ? `${settings.savingPercent}%` : 'Brak'}
          onPress={() => setPrompt({ kind: 'saving-percent' })}
        />
        <ListRow
          icon="pricetags-outline"
          iconColor={colors.bills}
          title="Kategorie"
          subtitle="Dodaj, zmień lub usuń kategorie"
          onPress={() => router.push('/categories')}
        />
        <ListRow
          icon="repeat-outline"
          iconColor={colors.warning}
          title="Rachunki i wydatki cykliczne"
          subtitle="Automatyczne pozycje w kolejnych miesiącach"
          onPress={() => router.push('/recurring')}
        />
      </Card>

      <AmountPrompt
        visible={prompt != null}
        title={
          prompt?.kind === 'month-budget'
            ? `Budżet na ${monthLabel(month)}`
            : prompt?.kind === 'category'
              ? `Limit: ${prompt.name}`
              : prompt?.kind === 'default-saving'
                ? 'Domyślna kwota oszczędności'
                : 'Procent dochodu na oszczędności'
        }
        description={
          prompt?.kind === 'saving-percent'
            ? 'Wpisz wartość procentową, np. 10 oznacza 10% dochodu.'
            : prompt?.kind === 'month-budget'
              ? 'Limit dotyczy wydatków — rachunki i oszczędności liczone są osobno.'
              : undefined
        }
        initialAmount={
          prompt?.kind === 'month-budget'
            ? (budget?.limit ?? 0)
            : prompt?.kind === 'category'
              ? prompt.current
              : prompt?.kind === 'default-saving'
                ? settings.defaultSaving
                : settings.savingPercent * 100
        }
        allowClear={prompt?.kind !== 'saving-percent'}
        onCancel={() => setPrompt(null)}
        onConfirm={handleConfirm}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  budgetBlock: { gap: spacing.md },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  amountRight: { alignItems: 'flex-end' },
  amountLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  amountValue: { color: colors.text, fontSize: font.h1, fontWeight: '800', marginTop: 2 },
  accent: { color: colors.accent },
  danger: { color: colors.danger },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  meta: { color: colors.textMuted, fontSize: font.tiny },
  warningBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  warningText: { flex: 1, color: colors.danger, fontSize: font.tiny, fontWeight: '600' },
  hint: { color: colors.textFaint, fontSize: font.tiny, lineHeight: 18 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  editButtonText: { color: colors.accent, fontSize: font.small, fontWeight: '700' },
  primaryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  primaryButtonText: { color: '#06210F', fontSize: font.small, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  switchLabel: { flex: 1, color: colors.textMuted, fontSize: font.small },
  link: { color: colors.accent, fontSize: font.small, fontWeight: '700' },
  pickerBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  pickerChipText: { color: colors.text, fontSize: font.tiny, fontWeight: '600' },
  categoryList: { gap: spacing.lg },
  categoryRow: { gap: spacing.sm },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryName: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryLabel: { color: colors.text, fontSize: font.small, fontWeight: '600' },
  categoryValue: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  categoryWarning: { color: colors.danger, fontSize: font.tiny, fontWeight: '600' },
});
