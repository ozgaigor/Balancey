import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { MonthSelector } from '../components/MonthSelector';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, font, radius, spacing } from '../theme';
import { formatMoney } from '../utils/currency';
import { formatDatePL, todayISO } from '../utils/dates';
import { useDbData } from '../hooks/useDbData';
import { useApp } from '../state/AppProvider';
import { listBills } from '../db/repositories/transactions';
import { toggleBillPaid } from '../services/transactionService';

export default function BillsScreen() {
  const insets = useSafeAreaInsets();
  const { month, goToPreviousMonth, goToNextMonth, goToCurrentMonth, refresh, showToast } = useApp();

  const billsState = useDbData(() => listBills(month), [month]);
  const bills = billsState.data ?? [];

  const unpaid = bills.filter((bill) => !bill.isPaid);
  const paid = bills.filter((bill) => bill.isPaid);
  const unpaidTotal = unpaid.reduce((sum, bill) => sum + bill.amount, 0);
  const paidTotal = paid.reduce((sum, bill) => sum + bill.amount, 0);

  const togglePaid = useCallback(
    async (id: number, name: string, nextPaid: boolean) => {
      await toggleBillPaid(id, nextPaid);
      refresh();
      showToast(nextPaid ? `Opłacono: ${name}` : `Cofnięto opłacenie: ${name}`);
    },
    [refresh, showToast]
  );

  const today = todayISO();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <ScreenHeader title="Rachunki" subtitle="Terminy i statusy płatności" back />

      <MonthSelector
        month={month}
        onPrevious={goToPreviousMonth}
        onNext={goToNextMonth}
        onPressLabel={goToCurrentMonth}
      />

      <View style={styles.totals}>
        <View style={[styles.totalBox, { borderColor: colors.warning }]}>
          <Text style={styles.totalLabel}>Do zapłaty</Text>
          <Text style={[styles.totalValue, { color: colors.warning }]}>
            {formatMoney(unpaidTotal)}
          </Text>
          <Text style={styles.totalHint}>{unpaid.length} pozycji</Text>
        </View>
        <View style={[styles.totalBox, { borderColor: colors.accent }]}>
          <Text style={styles.totalLabel}>Zapłacone</Text>
          <Text style={[styles.totalValue, { color: colors.accent }]}>{formatMoney(paidTotal)}</Text>
          <Text style={styles.totalHint}>{paid.length} pozycji</Text>
        </View>
      </View>

      <Card title="Do zapłaty">
        {unpaid.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Wszystko opłacone"
            description="Nie masz zaległych rachunków w tym miesiącu."
          />
        ) : (
          <View style={styles.list}>
            {unpaid.map((bill) => {
              const due = bill.dueDate ?? bill.date;
              const overdue = due < today;
              return (
                <View key={bill.id} style={styles.row}>
                  <Pressable
                    style={styles.rowInfo}
                    accessibilityRole="button"
                    onPress={() => router.push(`/transaction/${bill.id}`)}
                  >
                    <Text style={styles.rowName} numberOfLines={1}>
                      {bill.name || bill.categoryName || 'Rachunek'}
                    </Text>
                    <Text style={[styles.rowMeta, overdue && styles.overdue]}>
                      {overdue ? 'Termin minął: ' : 'Termin: '}
                      {formatDatePL(due)}
                      {bill.recurringId ? ' · cykliczny' : ''}
                    </Text>
                  </Pressable>
                  <Text style={styles.rowAmount}>{formatMoney(bill.amount)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Oznacz ${bill.name} jako zapłacony`}
                    onPress={() => togglePaid(bill.id, bill.name, true)}
                    style={({ pressed }) => [styles.payButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="checkmark" size={20} color="#06210F" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {paid.length > 0 && (
        <Card title="Zapłacone">
          <View style={styles.list}>
            {paid.map((bill) => (
              <View key={bill.id} style={styles.row}>
                <Pressable
                  style={styles.rowInfo}
                  accessibilityRole="button"
                  onPress={() => router.push(`/transaction/${bill.id}`)}
                >
                  <Text style={styles.rowName} numberOfLines={1}>
                    {bill.name || bill.categoryName || 'Rachunek'}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Zapłacono: {formatDatePL(bill.paidDate ?? bill.date)}
                  </Text>
                </Pressable>
                <Text style={[styles.rowAmount, styles.paidAmount]}>{formatMoney(bill.amount)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Cofnij opłacenie ${bill.name}`}
                  onPress={() => togglePaid(bill.id, bill.name, false)}
                  style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}
                >
                  <Ionicons name="arrow-undo-outline" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Button
        label="Dodaj rachunek"
        icon="add"
        onPress={() => router.push({ pathname: '/add', params: { type: 'bill' } })}
      />
      <Button
        label="Rachunki cykliczne"
        icon="repeat-outline"
        variant="secondary"
        onPress={() => router.push('/recurring')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  totals: { flexDirection: 'row', gap: spacing.sm },
  totalBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  totalLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  totalValue: { fontSize: font.h2, fontWeight: '800', marginTop: 2 },
  totalHint: { color: colors.textFaint, fontSize: font.tiny, marginTop: 2 },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  rowInfo: { flex: 1 },
  rowName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2 },
  overdue: { color: colors.danger, fontWeight: '700' },
  rowAmount: { color: colors.warning, fontSize: font.body, fontWeight: '700' },
  paidAmount: { color: colors.textMuted },
  payButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
