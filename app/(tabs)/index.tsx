import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BalanceCard } from '../../components/BalanceCard';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { MonthSelector } from '../../components/MonthSelector';
import { TransactionItem } from '../../components/TransactionItem';
import { colors, font, radius, spacing } from '../../theme';
import { formatMoney } from '../../utils/currency';
import { currentYearMonth, formatDatePL } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { listFrequent } from '../../db/repositories/hints';
import { listRecent } from '../../db/repositories/transactions';
import { getMonthOverview } from '../../services/budgetService';
import { scheduleDailyBudgetReminder } from '../../services/notificationService';
import { toggleBillPaid } from '../../services/transactionService';

const QUICK_LINKS: { label: string; icon: keyof typeof Ionicons.glyphMap; href: string }[] = [
  { label: 'Rachunki', icon: 'receipt-outline', href: '/bills' },
  { label: 'Cele', icon: 'flag-outline', href: '/savings' },
  { label: 'Plan', icon: 'clipboard-outline', href: '/plan' },
  { label: 'Statystyki', icon: 'stats-chart-outline', href: '/stats' },
];

export default function StartScreen() {
  const insets = useSafeAreaInsets();
  const { month, goToPreviousMonth, goToNextMonth, goToCurrentMonth, refresh, showToast, settings } =
    useApp();

  const overviewState = useDbData(() => getMonthOverview(month), [month]);
  const recentState = useDbData(() => listRecent(5), []);
  const frequentState = useDbData(() => listFrequent('expense', 6), []);

  const overview = overviewState.data;
  const recent = recentState.data ?? [];
  const frequent = frequentState.data ?? [];

  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  // Wieczorne przypomnienie o pozostałym budżecie — planowane po każdej zmianie
  // danych, więc kwota w powiadomieniu jest zawsze aktualna.
  useEffect(() => {
    if (!settings.notificationsEnabled || !overview || month !== currentYearMonth()) return;
    const remaining = overview.budget.hasLimit
      ? overview.budget.left
      : overview.summary.remaining;
    scheduleDailyBudgetReminder(remaining);
  }, [month, overview, settings.notificationsEnabled]);

  const markPaid = useCallback(
    async (id: number, name: string) => {
      await toggleBillPaid(id, true);
      showToast(`Opłacono: ${name}`);
      refresh();
    },
    [refresh, showToast]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: 150 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={overviewState.loading && overview != null}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <MonthSelector
        month={month}
        onPrevious={goToPreviousMonth}
        onNext={goToNextMonth}
        onPressLabel={goToCurrentMonth}
      />

      {overview ? (
        <BalanceCard
          overview={overview}
          onPressBudget={() => router.push('/(tabs)/budget')}
          onPressTile={(type) => router.push({ pathname: '/(tabs)/transactions', params: { type } })}
        />
      ) : (
        <Card>
          <Text style={styles.placeholder}>Wczytuję dane miesiąca…</Text>
        </Card>
      )}

      <View style={styles.quickLinks}>
        {QUICK_LINKS.map((link) => (
          <Pressable
            key={link.href}
            accessibilityRole="button"
            accessibilityLabel={link.label}
            onPress={() => router.push(link.href as never)}
            style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}
          >
            <Ionicons name={link.icon} size={20} color={colors.accent} />
            <Text style={styles.quickLinkLabel}>{link.label}</Text>
          </Pressable>
        ))}
      </View>

      {overview && overview.unpaidBills.length > 0 && (
        <Card
          title="Do zapłaty"
          action={
            <Pressable accessibilityRole="button" onPress={() => router.push('/bills')}>
              <Text style={styles.link}>Wszystkie</Text>
            </Pressable>
          }
        >
          <View style={styles.billList}>
            {overview.unpaidBills.slice(0, 3).map((bill) => (
              <View key={bill.id} style={styles.billRow}>
                <Pressable
                  style={styles.billInfo}
                  accessibilityRole="button"
                  onPress={() => router.push(`/transaction/${bill.id}`)}
                >
                  <Text style={styles.billName} numberOfLines={1}>
                    {bill.name}
                  </Text>
                  <Text style={styles.billDate}>
                    Termin: {formatDatePL(bill.dueDate ?? bill.date)}
                  </Text>
                </Pressable>
                <Text style={styles.billAmount}>{formatMoney(bill.amount)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Oznacz ${bill.name} jako zapłacony`}
                  onPress={() => markPaid(bill.id, bill.name)}
                  style={({ pressed }) => [styles.payButton, pressed && styles.pressed]}
                >
                  <Ionicons name="checkmark" size={18} color="#06210F" />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      )}

      {frequent.length > 0 && (
        <Card title="Ostatnie — powtórz jednym dotknięciem">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.repeatRow}>
            {frequent.map((hint) => (
              <Pressable
                key={hint.nameKey}
                accessibilityRole="button"
                accessibilityLabel={`Powtórz ${hint.displayName}`}
                onPress={() =>
                  router.push({
                    pathname: '/add',
                    params: {
                      name: hint.displayName,
                      amount: String(hint.lastAmount ?? 0),
                      categoryId: hint.categoryId != null ? String(hint.categoryId) : '',
                      type: hint.type,
                    },
                  })
                }
                style={({ pressed }) => [styles.repeatChip, pressed && styles.pressed]}
              >
                <Ionicons
                  name={(hint.categoryIcon ?? 'repeat-outline') as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={hint.categoryColor ?? colors.accent}
                />
                <View>
                  <Text style={styles.repeatName} numberOfLines={1}>
                    {hint.displayName}
                  </Text>
                  <Text style={styles.repeatAmount}>{formatMoney(hint.lastAmount ?? 0)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Card>
      )}

      <Card
        title="Ostatnie transakcje"
        action={
          <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/transactions')}>
            <Text style={styles.link}>Zobacz wszystkie</Text>
          </Pressable>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            icon="add-circle-outline"
            title="Brak transakcji"
            description="Dotknij przycisku Dodaj na dole ekranu, aby zapisać pierwszy wydatek."
          />
        ) : (
          <View>
            {recent.map((transaction) => (
              <TransactionItem
                key={transaction.id}
                transaction={transaction}
                onPress={() => router.push(`/transaction/${transaction.id}`)}
              />
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  placeholder: {
    color: colors.textMuted,
    fontSize: font.small,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  quickLinks: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickLink: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    minHeight: 68,
  },
  quickLinkLabel: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '600',
  },
  pressed: { opacity: 0.7 },
  link: {
    color: colors.accent,
    fontSize: font.small,
    fontWeight: '700',
  },
  billList: { gap: spacing.sm },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
  },
  billInfo: { flex: 1 },
  billName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  billDate: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  billAmount: { color: colors.warning, fontSize: font.body, fontWeight: '700' },
  payButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  repeatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 58,
    maxWidth: 190,
  },
  repeatName: { color: colors.text, fontSize: font.small, fontWeight: '600' },
  repeatAmount: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
});
