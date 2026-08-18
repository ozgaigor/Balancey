import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChart } from '../../components/BarChart';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { colors, font, radius, spacing } from '../../theme';
import { formatMoney } from '../../utils/currency';
import { currentYearMonth, monthLabel } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { getHistory } from '../../services/budgetService';
import { getMonthlySeries } from '../../services/statsService';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { setMonth } = useApp();

  const historyState = useDbData(() => getHistory(24), []);
  const seriesState = useDbData(() => getMonthlySeries(currentYearMonth(), 6), []);

  const history = historyState.data ?? [];
  const series = seriesState.data ?? [];

  const openMonth = (month: string) => {
    setMonth(month);
    router.push(`/month/${month}`);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: 150 }]}
    >
      <Text style={styles.title}>Historia</Text>

      {series.length > 0 && (
        <Card title="Ostatnie 6 miesięcy">
          <BarChart data={series} />
        </Card>
      )}

      {history.length === 0 ? (
        <Card>
          <EmptyState
            icon="time-outline"
            title="Brak historii"
            description="Gdy zapiszesz pierwsze transakcje, pojawi się tu podsumowanie każdego miesiąca."
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {history.map(({ month, summary }) => {
            const negative = summary.remaining < 0;
            return (
              <Pressable
                key={month}
                accessibilityRole="button"
                accessibilityLabel={`Otwórz ${monthLabel(month)}`}
                onPress={() => openMonth(month)}
                style={({ pressed }) => [styles.monthCard, pressed && styles.pressed]}
              >
                <View style={styles.monthHeader}>
                  <Text style={styles.monthName}>{monthLabel(month)}</Text>
                  <View style={styles.remainingBox}>
                    <Text style={styles.remainingLabel}>Pozostało</Text>
                    <Text style={[styles.remainingValue, negative && styles.danger]}>
                      {formatMoney(summary.remaining)}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <Stat label="Przychody" value={summary.income} color={colors.accent} />
                  <Stat label="Wydatki" value={summary.expenses} color={colors.danger} />
                  <Stat label="Rachunki" value={summary.billsPaid} color={colors.bills} />
                  <Stat label="Oszczędności" value={summary.savings} color={colors.savings} />
                </View>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    {summary.count} {summary.count === 1 ? 'transakcja' : 'transakcji'}
                    {summary.billsUnpaid > 0
                      ? ` · do zapłaty ${formatMoney(summary.billsUnpaid)}`
                      : ''}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {formatMoney(value, { decimals: false })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  title: { color: colors.text, fontSize: font.h1, fontWeight: '700' },
  list: { gap: spacing.md },
  monthCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pressed: { opacity: 0.75 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthName: { color: colors.text, fontSize: font.h2, fontWeight: '700' },
  remainingBox: { alignItems: 'flex-end' },
  remainingLabel: { color: colors.textFaint, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  remainingValue: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  danger: { color: colors.danger },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm },
  statLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },
  statValue: { fontSize: font.small, fontWeight: '700', marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerText: { color: colors.textMuted, fontSize: font.tiny },
});
