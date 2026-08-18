import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountPrompt } from '../components/AmountPrompt';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { MonthSelector } from '../components/MonthSelector';
import { ProgressBar } from '../components/ProgressBar';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, font, spacing } from '../theme';
import { planDifference, progressPercent } from '../utils/calculations';
import { formatMoney } from '../utils/currency';
import { addMonths, monthLabel } from '../utils/dates';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { getPlan, savePlan } from '../db/repositories/plans';
import { listRecurringForMonth } from '../db/repositories/recurring';
import { getMonthOverview, getMonthSummary } from '../services/budgetService';

type PlanField = 'plannedIncome' | 'plannedBills' | 'plannedExpenses' | 'plannedSavings';

const FIELD_LABELS: Record<PlanField, string> = {
  plannedIncome: 'Planowane przychody',
  plannedBills: 'Planowane rachunki',
  plannedExpenses: 'Planowane wydatki',
  plannedSavings: 'Planowane oszczędności',
};

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const { month, goToPreviousMonth, goToNextMonth, goToCurrentMonth, refresh, showToast, settings } =
    useApp();

  const [editing, setEditing] = useState<PlanField | null>(null);
  const [busy, setBusy] = useState(false);

  const planState = useDbData(() => getPlan(month), [month]);
  const overviewState = useDbData(() => getMonthOverview(month), [month]);

  const plan = planState.data;
  const overview = overviewState.data;

  const current = {
    plannedIncome: plan?.plannedIncome ?? 0,
    plannedBills: plan?.plannedBills ?? 0,
    plannedExpenses: plan?.plannedExpenses ?? 0,
    plannedSavings: plan?.plannedSavings ?? 0,
  };

  const handleSaveField = useCallback(
    async (amount: number) => {
      if (!editing) return;
      await savePlan(month, { ...current, [editing]: amount, note: plan?.note ?? null });
      setEditing(null);
      planState.reload();
      refresh();
      showToast('Zapisano plan');
    },
    [current, editing, month, plan?.note, planState, refresh, showToast]
  );

  /** Podpowiada plan na podstawie poprzedniego miesiąca i pozycji cyklicznych. */
  const suggestPlan = useCallback(async () => {
    setBusy(true);
    try {
      const previous = await getMonthSummary(addMonths(month, -1));
      const recurring = await listRecurringForMonth(month);
      const recurringBills = recurring
        .filter((item) => item.type === 'bill')
        .reduce((sum, item) => sum + item.amount, 0);

      await savePlan(month, {
        plannedIncome: previous.income,
        plannedBills: recurringBills > 0 ? recurringBills : previous.billsTotal,
        plannedExpenses: previous.expenses,
        plannedSavings: settings.defaultSaving > 0 ? settings.defaultSaving : previous.savings,
        note: plan?.note ?? null,
      });

      planState.reload();
      refresh();
      showToast('Plan wypełniony na podstawie poprzedniego miesiąca');
    } finally {
      setBusy(false);
    }
  }, [month, plan?.note, planState, refresh, settings.defaultSaving, showToast]);

  const rows: {
    field: PlanField;
    label: string;
    planned: number;
    actual: number;
    color: string;
    /** Czy przekroczenie planu jest niekorzystne. */
    overIsBad: boolean;
  }[] = [
    {
      field: 'plannedIncome',
      label: 'Przychody',
      planned: current.plannedIncome,
      actual: overview?.summary.income ?? 0,
      color: colors.accent,
      overIsBad: false,
    },
    {
      field: 'plannedBills',
      label: 'Rachunki',
      planned: current.plannedBills,
      actual: overview?.summary.billsTotal ?? 0,
      color: colors.bills,
      overIsBad: true,
    },
    {
      field: 'plannedExpenses',
      label: 'Wydatki',
      planned: current.plannedExpenses,
      actual: overview?.summary.expenses ?? 0,
      color: colors.danger,
      overIsBad: true,
    },
    {
      field: 'plannedSavings',
      label: 'Oszczędności',
      planned: current.plannedSavings,
      actual: overview?.summary.savings ?? 0,
      color: colors.savings,
      overIsBad: false,
    },
  ];

  const plannedRemaining =
    current.plannedIncome - current.plannedBills - current.plannedExpenses - current.plannedSavings;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <ScreenHeader title="Plan miesiąca" subtitle="Plan kontra rzeczywistość" back />

      <MonthSelector
        month={month}
        onPrevious={goToPreviousMonth}
        onNext={goToNextMonth}
        onPressLabel={goToCurrentMonth}
      />

      <Card title={`Plan — ${monthLabel(month)}`}>
        <ListRow
          icon="arrow-down-circle-outline"
          iconColor={colors.accent}
          title={FIELD_LABELS.plannedIncome}
          value={formatMoney(current.plannedIncome)}
          onPress={() => setEditing('plannedIncome')}
        />
        <ListRow
          icon="receipt-outline"
          iconColor={colors.bills}
          title={FIELD_LABELS.plannedBills}
          value={formatMoney(current.plannedBills)}
          onPress={() => setEditing('plannedBills')}
        />
        <ListRow
          icon="arrow-up-circle-outline"
          iconColor={colors.danger}
          title={FIELD_LABELS.plannedExpenses}
          value={formatMoney(current.plannedExpenses)}
          onPress={() => setEditing('plannedExpenses')}
        />
        <ListRow
          icon="wallet-outline"
          iconColor={colors.savings}
          title={FIELD_LABELS.plannedSavings}
          value={formatMoney(current.plannedSavings)}
          onPress={() => setEditing('plannedSavings')}
        />

        <View style={styles.plannedRemaining}>
          <Text style={styles.plannedRemainingLabel}>Planowane „pozostało”</Text>
          <Text
            style={[styles.plannedRemainingValue, plannedRemaining < 0 && styles.danger]}
          >
            {formatMoney(plannedRemaining)}
          </Text>
        </View>

        <Button
          label="Wypełnij na podstawie poprzedniego miesiąca"
          icon="sparkles-outline"
          variant="secondary"
          onPress={suggestPlan}
          loading={busy}
          style={styles.suggestButton}
        />
      </Card>

      <Card title="Plan kontra rzeczywistość">
        <View style={styles.comparisonList}>
          {rows.map((row) => {
            const difference = planDifference(row.planned, row.actual);
            const hasPlan = row.planned > 0;
            const bad = row.overIsBad ? difference > 0 : difference < 0;

            return (
              <View key={row.field} style={styles.comparisonRow}>
                <View style={styles.comparisonHeader}>
                  <Text style={styles.comparisonLabel}>{row.label}</Text>
                  <Text style={styles.comparisonValues}>
                    {formatMoney(row.actual)}
                    <Text style={styles.comparisonPlanned}> / {formatMoney(row.planned)}</Text>
                  </Text>
                </View>

                <ProgressBar
                  percent={progressPercent(row.actual, row.planned)}
                  color={row.color}
                  exceeded={hasPlan && row.overIsBad && row.actual > row.planned}
                  height={8}
                />

                {hasPlan && (
                  <View style={styles.differenceRow}>
                    <Ionicons
                      name={difference === 0 ? 'remove-outline' : difference > 0 ? 'arrow-up' : 'arrow-down'}
                      size={13}
                      color={difference === 0 ? colors.textMuted : bad ? colors.danger : colors.accent}
                    />
                    <Text
                      style={[
                        styles.differenceText,
                        {
                          color:
                            difference === 0 ? colors.textMuted : bad ? colors.danger : colors.accent,
                        },
                      ]}
                    >
                      Różnica: {difference >= 0 ? '+' : '-'}
                      {formatMoney(Math.abs(difference))}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </Card>

      <AmountPrompt
        visible={editing != null}
        title={editing ? FIELD_LABELS[editing] : ''}
        description={`Plan dotyczy miesiąca: ${monthLabel(month)}.`}
        initialAmount={editing ? current[editing] : 0}
        allowClear
        onCancel={() => setEditing(null)}
        onConfirm={handleSaveField}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  plannedRemaining: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  plannedRemainingLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  plannedRemainingValue: { color: colors.text, fontSize: font.h2, fontWeight: '800' },
  danger: { color: colors.danger },
  suggestButton: { marginTop: spacing.md },
  comparisonList: { gap: spacing.lg },
  comparisonRow: { gap: spacing.sm },
  comparisonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  comparisonLabel: { color: colors.text, fontSize: font.small, fontWeight: '600' },
  comparisonValues: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  comparisonPlanned: { color: colors.textMuted, fontWeight: '500' },
  differenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  differenceText: { fontSize: font.tiny, fontWeight: '600' },
});
