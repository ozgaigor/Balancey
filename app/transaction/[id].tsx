import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CategoryButton } from '../../components/CategoryButton';
import { DateField } from '../../components/DateField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField } from '../../components/TextField';
import { colors, font, radius, spacing, typeColor, typeLabel } from '../../theme';
import type { PaymentMethod, TransactionType } from '../../types';
import { formatMoney, moneyToPlainString, parseAmount } from '../../utils/currency';
import { formatDateLong } from '../../utils/dates';
import { useDbData } from '../../hooks/useDbData';
import { useApp } from '../../state/AppProvider';
import { listCategories } from '../../db/repositories/categories';
import { listGoals } from '../../db/repositories/savings';
import { getTransaction } from '../../db/repositories/transactions';
import {
  duplicate,
  editTransaction,
  removeTransaction,
} from '../../services/transactionService';

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

export default function TransactionDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number.parseInt(id ?? '', 10);
  const { refresh, showToast } = useApp();

  const transactionState = useDbData(() => getTransaction(transactionId), [transactionId]);
  const transaction = transactionState.data;

  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isPaid, setIsPaid] = useState(true);
  const [goalId, setGoalId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const categoriesState = useDbData(() => listCategories(type), [type]);
  const goalsState = useDbData(() => listGoals(), []);
  const categories = categoriesState.data ?? [];
  const goals = goalsState.data ?? [];

  useEffect(() => {
    if (!transaction) return;
    setType(transaction.type);
    setAmountText(moneyToPlainString(transaction.amount));
    setName(transaction.name);
    setNote(transaction.description ?? '');
    setDate(transaction.date);
    setCategoryId(transaction.categoryId);
    setPaymentMethod(transaction.paymentMethod);
    setIsPaid(transaction.isPaid);
    setGoalId(transaction.goalId);
  }, [transaction]);

  const handleSave = useCallback(async () => {
    const amount = parseAmount(amountText);
    if (amount == null || amount <= 0) {
      showToast('Podaj poprawną kwotę', 'warning');
      return;
    }

    setSaving(true);
    try {
      await editTransaction(transactionId, {
        type,
        amount,
        categoryId,
        name: name.trim(),
        description: note.trim() || null,
        date,
        paymentMethod,
        isPaid: type === 'bill' ? isPaid : true,
        dueDate: type === 'bill' ? (transaction?.dueDate ?? date) : null,
        paidDate: type === 'bill' && isPaid ? (transaction?.paidDate ?? date) : null,
        goalId: type === 'saving' ? goalId : null,
      });
      refresh();
      transactionState.reload();
      setEditing(false);
      showToast('Zapisano zmiany');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Nie udało się zapisać', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    amountText,
    categoryId,
    date,
    goalId,
    isPaid,
    name,
    note,
    paymentMethod,
    refresh,
    showToast,
    transaction,
    transactionId,
    transactionState,
    type,
  ]);

  const handleDelete = useCallback(() => {
    const label =
      transaction?.type === 'income'
        ? 'Usunąć ten przychód?'
        : transaction?.type === 'bill'
          ? 'Usunąć ten rachunek?'
          : transaction?.type === 'saving'
            ? 'Usunąć tę wpłatę?'
            : 'Usunąć ten wydatek?';

    Alert.alert(label, 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          await removeTransaction(transactionId);
          refresh();
          showToast('Usunięto transakcję');
          if (router.canGoBack()) router.back();
          else router.replace('/');
        },
      },
    ]);
  }, [refresh, showToast, transaction?.type, transactionId]);

  const handleDuplicate = useCallback(async () => {
    const newId = await duplicate(transactionId);
    refresh();
    if (newId) {
      showToast('Utworzono kopię z dzisiejszą datą');
      router.replace(`/transaction/${newId}`);
    }
  }, [refresh, showToast, transactionId]);

  if (!transaction) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <ScreenHeader title="Transakcja" back />
        <Text style={styles.placeholder}>
          {transactionState.loading ? 'Wczytuję…' : 'Nie znaleziono transakcji.'}
        </Text>
      </View>
    );
  }

  const color = typeColor(transaction.type);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        title={editing ? 'Edycja' : 'Szczegóły'}
        subtitle={typeLabel(transaction.type)}
        back
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Anuluj edycję' : 'Edytuj'}
            onPress={() => setEditing((value) => !value)}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Ionicons name={editing ? 'close' : 'create-outline'} size={20} color={colors.text} />
          </Pressable>
        }
      />

      {!editing ? (
        <>
          <Card>
            <View style={styles.heroBox}>
              <View style={[styles.heroIcon, { backgroundColor: `${transaction.categoryColor ?? color}22` }]}>
                <Ionicons
                  name={(transaction.categoryIcon ?? 'pricetag-outline') as keyof typeof Ionicons.glyphMap}
                  size={26}
                  color={transaction.categoryColor ?? color}
                />
              </View>
              <Text style={[styles.heroAmount, { color }]} numberOfLines={1} adjustsFontSizeToFit>
                {transaction.type === 'income' ? '+' : '-'}
                {formatMoney(transaction.amount)}
              </Text>
              <Text style={styles.heroName}>{transaction.name || 'Bez nazwy'}</Text>
            </View>

            <View style={styles.detailList}>
              <DetailRow label="Kategoria" value={transaction.categoryName ?? 'Bez kategorii'} />
              <DetailRow label="Data" value={formatDateLong(transaction.date)} />
              {transaction.type === 'bill' && (
                <>
                  <DetailRow
                    label="Termin płatności"
                    value={formatDateLong(transaction.dueDate ?? transaction.date)}
                  />
                  <DetailRow
                    label="Status"
                    value={transaction.isPaid ? 'Zapłacony' : 'Do zapłaty'}
                    valueColor={transaction.isPaid ? colors.accent : colors.warning}
                  />
                  {transaction.paidDate && (
                    <DetailRow label="Data zapłaty" value={formatDateLong(transaction.paidDate)} />
                  )}
                </>
              )}
              {transaction.paymentMethod && (
                <DetailRow
                  label="Metoda płatności"
                  value={
                    PAYMENT_METHODS.find((method) => method.value === transaction.paymentMethod)
                      ?.label ?? transaction.paymentMethod
                  }
                />
              )}
              {transaction.recurringId && (
                <DetailRow label="Źródło" value="Pozycja cykliczna" />
              )}
              {transaction.description && (
                <DetailRow label="Notatka" value={transaction.description} />
              )}
            </View>
          </Card>

          <View style={styles.actions}>
            <Button
              label="Edytuj"
              icon="create-outline"
              variant="secondary"
              onPress={() => setEditing(true)}
              style={styles.action}
            />
            <Button
              label="Duplikuj"
              icon="copy-outline"
              variant="secondary"
              onPress={handleDuplicate}
              style={styles.action}
            />
          </View>

          <Button label="Usuń" icon="trash-outline" variant="danger" onPress={handleDelete} />
        </>
      ) : (
        <>
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={type}
            onChange={(value) => {
              setType(value);
              setCategoryId(null);
            }}
          />

          <Card>
            <View style={styles.form}>
              <TextField
                label="Kwota"
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                suffix="zł"
                hint={
                  parseAmount(amountText) != null
                    ? formatMoney(parseAmount(amountText) as number)
                    : 'np. 42,50'
                }
              />

              <TextField
                label={type === 'income' ? 'Źródło' : 'Nazwa'}
                value={name}
                onChangeText={setName}
                placeholder="Opcjonalnie"
              />

              <DateField
                label={type === 'bill' ? 'Termin płatności' : 'Data'}
                value={date}
                onChange={setDate}
              />

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Kategoria</Text>
                <View style={styles.categoryGrid}>
                  {categories.map((category) => (
                    <CategoryButton
                      key={category.id}
                      name={category.name}
                      icon={category.icon}
                      color={category.color}
                      selected={categoryId === category.id}
                      onPress={() =>
                        setCategoryId((current) => (current === category.id ? null : category.id))
                      }
                    />
                  ))}
                </View>
              </View>

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
                  <Text style={styles.fieldLabel}>Zapłacony</Text>
                  <Switch
                    value={isPaid}
                    onValueChange={setIsPaid}
                    trackColor={{ false: colors.surfaceStrong, true: colors.accentDark }}
                    thumbColor={isPaid ? colors.accent : '#7A8794'}
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
          </Card>

          <Button label="Zapisz zmiany" icon="checkmark" onPress={handleSave} loading={saving} large />
        </>
      )}
    </ScrollView>
  );
}

function DetailRow({
  label,
  value,
  valueColor = colors.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  placeholder: { color: colors.textMuted, fontSize: font.small, paddingHorizontal: spacing.lg },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  heroBox: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmount: { fontSize: 32, fontWeight: '800' },
  heroName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  detailList: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  detailLabel: { color: colors.textMuted, fontSize: font.small },
  detailValue: { flex: 1, fontSize: font.small, fontWeight: '600', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  form: { gap: spacing.lg },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: '600' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
