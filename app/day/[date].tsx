import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionItem } from '../../components/TransactionItem';
import { colors, font, radius, spacing } from '../../theme';
import { summarize } from '../../utils/calculations';
import { formatMoney } from '../../utils/currency';
import { addDays, formatDateLong, isValidISODate, todayISO } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { listByDate } from '../../db/repositories/transactions';

export default function DayScreen() {
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const day = isValidISODate(date ?? '') ? (date as string) : todayISO();

  const transactionsState = useDbData(() => listByDate(day), [day]);
  const transactions = transactionsState.data ?? [];
  const summary = summarize(transactions);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <ScreenHeader title={formatDateLong(day)} subtitle="Widok dnia" back />

      <View style={styles.dayNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Poprzedni dzień"
          onPress={() => router.replace(`/day/${addDays(day, -1)}`)}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.navText}>Poprzedni</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Następny dzień"
          onPress={() => router.replace(`/day/${addDays(day, 1)}`)}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Text style={styles.navText}>Następny</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      <Card>
        <View style={styles.totalsRow}>
          <View>
            <Text style={styles.totalLabel}>Wydatki tego dnia</Text>
            <Text style={styles.totalValue}>{formatMoney(summary.expenses)}</Text>
          </View>
          {summary.income > 0 && (
            <View style={styles.totalRight}>
              <Text style={styles.totalLabel}>Przychody</Text>
              <Text style={[styles.totalValue, styles.accent]}>{formatMoney(summary.income)}</Text>
            </View>
          )}
        </View>

        {(summary.billsPaid > 0 || summary.savings > 0) && (
          <View style={styles.extraRow}>
            {summary.billsPaid > 0 && (
              <Text style={styles.extra}>Rachunki: {formatMoney(summary.billsPaid)}</Text>
            )}
            {summary.savings > 0 && (
              <Text style={styles.extra}>Oszczędności: {formatMoney(summary.savings)}</Text>
            )}
          </View>
        )}
      </Card>

      <Card title={`Transakcje (${transactions.length})`}>
        {transactions.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Brak transakcji tego dnia"
            description="Dodaj wydatek, aby zobaczyć go w tym miejscu."
          />
        ) : (
          transactions.map((transaction) => (
            <TransactionItem
              key={transaction.id}
              transaction={transaction}
              showDate={false}
              onPress={() => router.push(`/transaction/${transaction.id}`)}
            />
          ))
        )}
      </Card>

      <Button
        label="Dodaj wydatek z tą datą"
        icon="add"
        onPress={() => router.push({ pathname: '/add', params: { date: day } })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  dayNav: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  navText: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRight: { alignItems: 'flex-end' },
  totalLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  totalValue: { color: colors.text, fontSize: font.h1, fontWeight: '800', marginTop: 2 },
  accent: { color: colors.accent },
  extraRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  extra: { color: colors.textMuted, fontSize: font.tiny },
});
