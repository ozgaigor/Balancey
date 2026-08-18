import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DonutChart } from '../../components/DonutChart';
import { EmptyState } from '../../components/EmptyState';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionItem } from '../../components/TransactionItem';
import { colors, font, radius, spacing } from '../../theme';
import { formatMoney } from '../../utils/currency';
import { currentYearMonth, isValidYearMonth, monthLabel } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { getMonthOverview } from '../../services/budgetService';
import { printMonth, shareMonthPdf } from '../../services/pdfService';

export default function MonthDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { ym } = useLocalSearchParams<{ ym: string }>();
  const month = isValidYearMonth(ym ?? '') ? (ym as string) : currentYearMonth();
  const { showToast, setMonth } = useApp();

  const [working, setWorking] = useState<'pdf' | 'print' | null>(null);

  const overviewState = useDbData(() => getMonthOverview(month), [month]);
  const overview = overviewState.data;

  const handlePdf = useCallback(async () => {
    setWorking('pdf');
    try {
      const result = await shareMonthPdf(month);
      showToast(`PDF A5 gotowy: ${result.fileName}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Nie udało się utworzyć PDF', 'error');
    } finally {
      setWorking(null);
    }
  }, [month, showToast]);

  const handlePrint = useCallback(async () => {
    setWorking('print');
    try {
      await printMonth(month);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Nie udało się otworzyć drukowania', 'error');
    } finally {
      setWorking(null);
    }
  }, [month, showToast]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <ScreenHeader title={monthLabel(month)} subtitle="Podsumowanie miesiąca" back />

      {!overview ? (
        <Card>
          <Text style={styles.placeholder}>Wczytuję dane…</Text>
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.heroBox}>
              <Text style={styles.heroLabel}>Pozostało</Text>
              <Text
                style={[styles.heroValue, overview.summary.remaining < 0 && styles.danger]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatMoney(overview.summary.remaining)}
              </Text>
            </View>

            <View style={styles.summaryList}>
              <SummaryRow label="Przychody" value={overview.summary.income} color={colors.accent} />
              <SummaryRow
                label="Rachunki (zapłacone)"
                value={overview.summary.billsPaid}
                color={colors.bills}
              />
              {overview.summary.billsUnpaid > 0 && (
                <SummaryRow
                  label="Rachunki do zapłaty"
                  value={overview.summary.billsUnpaid}
                  color={colors.warning}
                />
              )}
              <SummaryRow label="Wydatki" value={overview.summary.expenses} color={colors.danger} />
              <SummaryRow
                label="Oszczędności"
                value={overview.summary.savings}
                color={colors.savings}
              />
            </View>

            {overview.budget.hasLimit && (
              <View style={styles.budgetBox}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetLabel}>Budżet wydatków</Text>
                  <Text style={[styles.budgetValue, overview.budget.exceeded && styles.danger]}>
                    {overview.budget.percent}%
                  </Text>
                </View>
                <ProgressBar
                  percent={overview.budget.barPercent}
                  exceeded={overview.budget.exceeded}
                  height={10}
                />
                <Text style={styles.budgetFoot}>
                  {formatMoney(overview.budget.spent)} z {formatMoney(overview.budget.limit)}
                </Text>
              </View>
            )}
          </Card>

          <Card title="Wydatki według kategorii">
            {overview.categorySpending.length === 0 ? (
              <EmptyState
                icon="pie-chart-outline"
                title="Brak wydatków"
                description="W tym miesiącu nie zapisano jeszcze żadnego wydatku."
              />
            ) : (
              <DonutChart
                data={overview.categorySpending.map((item) => ({
                  label: item.name,
                  value: item.total,
                  color: item.color,
                }))}
              />
            )}
          </Card>

          <Card
            title="Dokument PDF (A5)"
          >
            <Text style={styles.pdfInfo}>
              Podsumowanie miesiąca zapisane jako prawdziwa strona A5 (148 × 210 mm) — gotowe do
              wydruku lub wysłania.
            </Text>
            <View style={styles.pdfActions}>
              <Button
                label="Zapisz / udostępnij PDF"
                icon="document-text-outline"
                onPress={handlePdf}
                loading={working === 'pdf'}
                style={styles.pdfAction}
              />
              <Button
                label="Drukuj"
                icon="print-outline"
                variant="secondary"
                onPress={handlePrint}
                loading={working === 'print'}
                style={styles.pdfAction}
              />
            </View>
          </Card>

          <Card
            title={`Transakcje (${overview.transactions.length})`}
          >
            {overview.transactions.length === 0 ? (
              <EmptyState icon="list-outline" title="Brak transakcji w tym miesiącu" />
            ) : (
              <>
                {overview.transactions.slice(0, 12).map((transaction) => (
                  <TransactionItem
                    key={transaction.id}
                    transaction={transaction}
                    onPress={() => router.push(`/transaction/${transaction.id}`)}
                  />
                ))}
                {overview.transactions.length > 12 && (
                  <Button
                    label="Zobacz wszystkie"
                    variant="secondary"
                    onPress={() => {
                      setMonth(month);
                      router.push('/(tabs)/transactions');
                    }}
                    style={styles.moreButton}
                  />
                )}
              </>
            )}
          </Card>

          <Button
            label="Statystyki miesiąca"
            icon="stats-chart-outline"
            variant="secondary"
            onPress={() => {
              setMonth(month);
              router.push('/stats');
            }}
          />
        </>
      )}
    </ScrollView>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryLabelBox}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={styles.summaryValue}>{formatMoney(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  placeholder: { color: colors.textMuted, fontSize: font.small, textAlign: 'center' },
  heroBox: { alignItems: 'center', paddingBottom: spacing.lg },
  heroLabel: {
    color: colors.textMuted,
    fontSize: font.tiny,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  heroValue: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: spacing.xs },
  danger: { color: colors.danger },
  summaryList: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabelBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  summaryLabel: { color: colors.textMuted, fontSize: font.small },
  summaryValue: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  budgetBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  budgetValue: { color: colors.text, fontSize: font.small, fontWeight: '800' },
  budgetFoot: { color: colors.textFaint, fontSize: font.tiny },
  pdfInfo: { color: colors.textMuted, fontSize: font.tiny, lineHeight: 18, marginBottom: spacing.md },
  pdfActions: { gap: spacing.sm },
  pdfAction: { width: '100%' },
  moreButton: { marginTop: spacing.md },
});
