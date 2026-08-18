import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChart } from '../components/BarChart';
import { Card } from '../components/Card';
import { DonutChart } from '../components/DonutChart';
import { EmptyState } from '../components/EmptyState';
import { MonthSelector } from '../components/MonthSelector';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, font, radius, spacing } from '../theme';
import { formatMoney } from '../utils/currency';
import { addMonths, formatDatePL, monthLabel } from '../utils/dates';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { comparisonSentence, getMonthStats } from '../services/statsService';

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { month, goToPreviousMonth, goToNextMonth, goToCurrentMonth } = useApp();

  const statsState = useDbData(() => getMonthStats(month), [month]);
  const stats = statsState.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <ScreenHeader title="Statystyki" subtitle={monthLabel(month)} back />

      <MonthSelector
        month={month}
        onPrevious={goToPreviousMonth}
        onNext={goToNextMonth}
        onPressLabel={goToCurrentMonth}
      />

      {!stats ? (
        <Card>
          <Text style={styles.placeholder}>Wczytuję statystyki…</Text>
        </Card>
      ) : stats.summary.count === 0 ? (
        <Card>
          <EmptyState
            icon="stats-chart-outline"
            title="Brak danych"
            description="W tym miesiącu nie ma jeszcze transakcji do podsumowania."
          />
        </Card>
      ) : (
        <>
          <Card title="Podsumowanie">
            <View style={styles.grid}>
              <Metric label="Przychody" value={formatMoney(stats.summary.income)} color={colors.accent} />
              <Metric label="Wydatki" value={formatMoney(stats.summary.expenses)} color={colors.danger} />
              <Metric label="Rachunki" value={formatMoney(stats.summary.billsPaid)} color={colors.bills} />
              <Metric
                label="Oszczędności"
                value={formatMoney(stats.summary.savings)}
                color={colors.savings}
              />
              <Metric
                label="Średnio dziennie"
                value={formatMoney(stats.averageDailyExpense)}
                color={colors.text}
              />
              <Metric
                label="Pozostało"
                value={formatMoney(stats.summary.remaining)}
                color={stats.summary.remaining < 0 ? colors.danger : colors.accent}
              />
            </View>

            {stats.expensesChange != null && (
              <View
                style={[
                  styles.comparison,
                  {
                    backgroundColor:
                      stats.expensesChange <= 0 ? colors.accentSoft : colors.dangerSoft,
                  },
                ]}
              >
                <Ionicons
                  name={stats.expensesChange <= 0 ? 'trending-down-outline' : 'trending-up-outline'}
                  size={18}
                  color={stats.expensesChange <= 0 ? colors.accent : colors.danger}
                />
                <Text
                  style={[
                    styles.comparisonText,
                    { color: stats.expensesChange <= 0 ? colors.accent : colors.danger },
                  ]}
                >
                  {comparisonSentence(stats.expensesChange)}
                </Text>
              </View>
            )}
          </Card>

          {stats.largestExpense && (
            <Card title="Największy wydatek">
              <View style={styles.largestRow}>
                <View style={styles.largestInfo}>
                  <Text style={styles.largestName}>{stats.largestExpense.name}</Text>
                  <Text style={styles.largestMeta}>
                    {stats.largestExpense.categoryName ?? 'Bez kategorii'} ·{' '}
                    {formatDatePL(stats.largestExpense.date)}
                  </Text>
                </View>
                <Text style={styles.largestAmount}>{formatMoney(stats.largestExpense.amount)}</Text>
              </View>
            </Card>
          )}

          <Card title="Wydatki według kategorii">
            {stats.categories.length === 0 ? (
              <EmptyState icon="pie-chart-outline" title="Brak wydatków w tym miesiącu" />
            ) : (
              <DonutChart
                data={stats.categories.map((category) => ({
                  label: category.name,
                  value: category.total,
                  color: category.color,
                }))}
              />
            )}
          </Card>

          <Card title="Przychody i wydatki — 6 miesięcy">
            <BarChart data={stats.series} />
          </Card>

          {stats.previousSummary && (
            <Card title={`Porównanie z ${monthLabel(addMonths(month, -1))}`}>
              <ComparisonRow
                label="Przychody"
                current={stats.summary.income}
                previous={stats.previousSummary.income}
                positiveIsGood
              />
              <ComparisonRow
                label="Wydatki"
                current={stats.summary.expenses}
                previous={stats.previousSummary.expenses}
              />
              <ComparisonRow
                label="Oszczędności"
                current={stats.summary.savings}
                previous={stats.previousSummary.savings}
                positiveIsGood
              />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

function ComparisonRow({
  label,
  current,
  previous,
  positiveIsGood = false,
}: {
  label: string;
  current: number;
  previous: number;
  positiveIsGood?: boolean;
}) {
  const difference = current - previous;
  const better = positiveIsGood ? difference >= 0 : difference <= 0;

  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <Text style={styles.comparisonValue}>{formatMoney(current)}</Text>
      <Text style={[styles.comparisonDiff, { color: better ? colors.accent : colors.danger }]}>
        {difference >= 0 ? '+' : '-'}
        {formatMoney(Math.abs(difference), { symbol: '' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  placeholder: { color: colors.textMuted, fontSize: font.small, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 72,
    justifyContent: 'center',
  },
  metricLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  metricValue: { fontSize: font.body, fontWeight: '700', marginTop: 4 },
  comparison: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  comparisonText: { flex: 1, fontSize: font.small, fontWeight: '600' },
  largestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  largestInfo: { flex: 1 },
  largestName: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  largestMeta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  largestAmount: { color: colors.danger, fontSize: font.h2, fontWeight: '800' },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  comparisonLabel: { flex: 1, color: colors.textMuted, fontSize: font.small },
  comparisonValue: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  comparisonDiff: { fontSize: font.tiny, fontWeight: '700', width: 96, textAlign: 'right' },
});
